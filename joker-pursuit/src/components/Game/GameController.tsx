import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, createInitialGameState, advanceToNextPlayer, isGameOver, shuffleAndDealCards, Move } from '../../models/GameState';
import { getPossibleMoves, applyMove, findSpaceForPeg } from '../../utils/MovementUtils';
import { BoardSpace } from '../../models/BoardModel';
import { Card } from '../../models/Card';
import {
  cloneGameState,
  HarnessActionResult,
  HarnessCardInput,
  HarnessMoveOptions,
  JokerPursuitHarnessApi,
  normalizeGameState,
  placePegOnBoard,
  serializeGameState,
  setCurrentPlayerById,
  setPegPositionsOnBoard,
  setPlayerHandById
} from '../../devtools/gameHarness';
import Board from '../Board/Board';
import CardHand from '../CardHand/CardHand';
import './GameController.css';
import { Player } from '../../models/Player';

interface GameControllerProps {
  playerNames: string[];
  playerTeams: Record<string, number>;
  numBoardSections: number;
  playerColors: Record<string, string>;
  
  // Multiplayer props
  isMultiplayer?: boolean;
  isCurrentPlayerTurn?: boolean;
  onMove?: (moveData: any) => void;
  onUpdateGameState?: (gameState: GameState) => void;
  gameStateOverride?: GameState;
  localPlayerId?: string;
  recentMoveHighlight?: {
    id: string;
    fromSpaceId?: string;
    toSpaceId?: string;
    playerColor?: string;
  };
  onHarnessSyncToServer?: () => Promise<HarnessActionResult>;
  onHarnessCommitStateToServer?: (nextState: GameState) => Promise<HarnessActionResult>;
}

// Add new interface for nine card state
interface NineCardState {
  direction?: 'forward' | 'backward';  // Explicitly typed as union
  steps?: number;
  state: 'INITIAL' | 'DIRECTION_SELECTED' | 'STEPS_CHOSEN' | 'FIRST_MOVE_COMPLETE' | 'SECOND_MOVE_READY' | 'NO_VALID_SECOND_MOVES' | 'SPLIT_SELECT_STEPS';
  firstMoveComplete: boolean;
  firstMovePegId?: string;
  remainingSteps?: number;
  // Track selectable pegs for second move
  selectablePegsForSecondMove?: string[];
  // Add flag to track if split was selected
  splitSelected?: boolean;
}

// Add new interface for seven card state
interface SevenCardState {
  // The current state in the 7 card split process
  state: 'INITIAL' | 'SPLIT_SELECTED' | 'STEPS_CHOSEN' | 'FIRST_MOVE_COMPLETE' | 'SECOND_MOVE_READY';
  isSplit: boolean;
  firstMovePegId?: string;
  firstMoveSteps?: number;
  remainingSteps?: number;
  // Track which spaces were selectable for the first move
  firstMoveSelectableSpaces?: string[];
  // Track destination space for first move
  firstMoveDestination?: string;
  // Track selectable pegs for second move
  selectablePegsForSecondMove?: string[];
}

interface FloatingElement {
  id: number;
  type: 'card' | 'peg';
  color: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const expandSingleDestinationMoves = (moves: Move[]): Move[] => {
  const expanded: Move[] = [];

  moves.forEach(move => {
    if (!move.destinations || move.destinations.length === 0) {
      return;
    }

    move.destinations.forEach(destination => {
      expanded.push({
        ...move,
        destinations: [destination]
      });
    });
  });

  return expanded;
};

const getOrderedTrackSpaces = (gameState: GameState): BoardSpace[] =>
  Array.from(gameState.board.allSpaces.values())
    .filter(space => space.type === 'normal' || space.type === 'entrance' || space.type === 'corner')
    .sort((left, right) => {
      const leftSection = left.sectionIndex ?? 0;
      const rightSection = right.sectionIndex ?? 0;
      if (leftSection !== rightSection) {
        return leftSection - rightSection;
      }
      return left.index - right.index;
    });

const resolveNineCastleEntryMove = (gameState: GameState, move: Move): Move | null => {
  const nineMetadata = move.metadata?.nineCardMove;
  if (!nineMetadata || nineMetadata.direction !== 'forward') {
    return null;
  }

  if (!move.metadata?.willPassCastleEntrance && !move.metadata?.castleEntry) {
    return null;
  }

  const playerSection = gameState.board.sections.find(section =>
    section.playerIds?.includes(move.playerId)
  );
  if (!playerSection) {
    return null;
  }

  const pegSpace = findSpaceForPeg(gameState, move.pegId);
  if (!pegSpace || pegSpace.type === 'home' || pegSpace.type === 'castle') {
    return null;
  }

  const orderedSpaces = getOrderedTrackSpaces(gameState);
  const currentSpaceIndex = orderedSpaces.findIndex(space => space.id === pegSpace.id);
  const castleEntranceIndex = orderedSpaces.findIndex(
    space =>
      space.sectionIndex === playerSection.index &&
      space.type === 'entrance' &&
      space.index === 3
  );
  if (currentSpaceIndex === -1 || castleEntranceIndex === -1) {
    return null;
  }

  const stepsToEntrance =
    castleEntranceIndex >= currentSpaceIndex
      ? castleEntranceIndex - currentSpaceIndex
      : (orderedSpaces.length - currentSpaceIndex) + castleEntranceIndex;
  const castleSteps = nineMetadata.steps - stepsToEntrance - 1;
  if (castleSteps < 0 || castleSteps > 4) {
    return null;
  }

  const castleDestination = Array.from(gameState.board.allSpaces.values()).find(
    space =>
      space.sectionIndex === playerSection.index &&
      space.type === 'castle' &&
      space.index === castleSteps
  );
  if (!castleDestination) {
    return null;
  }

  const hasOwnPegInCastleDestination = castleDestination.pegs.some(existingPegId => {
    const [existingPlayerId] = existingPegId.split('-peg-');
    return existingPlayerId === move.playerId;
  });
  if (hasOwnPegInCastleDestination) {
    return null;
  }

  return {
    ...move,
    destinations: [castleDestination.id],
    metadata: {
      ...move.metadata,
      castleEntry: true,
      castleMovement: true
    }
  };
};

const moveChangesPegPosition = (gameState: GameState, move: Move): boolean => {
  if (!move.destinations || move.destinations.length === 0) {
    return false;
  }

  const candidateMove: Move = {
    ...move,
    destinations: [move.destinations[0]]
  };

  const baselineState = normalizeGameState(cloneGameState(gameState));
  const beforeSpace = findSpaceForPeg(baselineState, candidateMove.pegId);
  const { newState } = applyMove(baselineState, candidateMove);
  const afterSpace = findSpaceForPeg(newState, candidateMove.pegId);

  return Boolean(
    beforeSpace &&
      afterSpace &&
      beforeSpace.id !== afterSpace.id &&
      afterSpace.id === candidateMove.destinations[0]
  );
};

const isExecutableMove = (gameState: GameState, move: Move): boolean => {
  if (moveChangesPegPosition(gameState, move)) {
    return true;
  }

  const resolvedNineCastleEntryMove = resolveNineCastleEntryMove(gameState, move);
  if (!resolvedNineCastleEntryMove) {
    return false;
  }

  return moveChangesPegPosition(gameState, resolvedNineCastleEntryMove);
};

const getExecutableMoves = (
  gameState: GameState,
  playerId: string,
  cardId: string,
  options?: {
    direction?: 'forward' | 'backward';
    steps?: number;
    isSecondMove?: boolean;
    firstMovePegId?: string;
  }
): Move[] =>
  expandSingleDestinationMoves(getPossibleMoves(gameState, playerId, cardId, options)).filter(move =>
    isExecutableMove(gameState, move)
  );

const hasLegalMoveForCard = (gameState: GameState, player: Player, card: Card): boolean => {
  if (card.rank === '7') {
    if (getExecutableMoves(gameState, player.id, card.id).length > 0) {
      return true;
    }

    for (let firstSteps = 1; firstSteps <= 6; firstSteps += 1) {
      const firstMoves = getExecutableMoves(gameState, player.id, card.id, {
        steps: firstSteps
      }).map(move => ({
        ...move,
        metadata: {
          ...move.metadata,
          sevenCardMove: {
            steps: firstSteps,
            isFirstMove: true
          }
        }
      }));

      for (const firstMove of firstMoves) {
        const firstMoveState = normalizeGameState(
          cloneGameState(applyMove(cloneGameState(gameState), firstMove).newState)
        );
        const secondSteps = 7 - firstSteps;
        const secondMoves = getExecutableMoves(firstMoveState, player.id, card.id, {
          steps: secondSteps,
          isSecondMove: true,
          firstMovePegId: firstMove.pegId
        });

        if (secondMoves.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  if (card.rank === '9') {
    if (getExecutableMoves(gameState, player.id, card.id, { direction: 'forward', steps: 9 }).length > 0) {
      return true;
    }

    for (const direction of ['forward', 'backward'] as const) {
      for (let firstSteps = 1; firstSteps <= 8; firstSteps += 1) {
        const splitFirstMoves = getExecutableMoves(gameState, player.id, card.id, {
          direction,
          steps: firstSteps
        }).map(move => ({
          ...move,
          metadata: {
            ...move.metadata,
            nineCardMove: {
              direction,
              steps: firstSteps,
              isFirstMove: true
            }
          }
        }));

        const secondDirection: 'forward' | 'backward' = direction === 'forward'
          ? 'backward'
          : 'forward';
        const secondSteps = 9 - firstSteps;

        for (const firstMove of splitFirstMoves) {
          const firstMoveState = normalizeGameState(
            cloneGameState(applyMove(cloneGameState(gameState), firstMove).newState)
          );
          const secondMoves = getExecutableMoves(firstMoveState, player.id, card.id, {
            direction: secondDirection,
            steps: secondSteps,
            isSecondMove: true,
            firstMovePegId: firstMove.pegId
          });

          if (secondMoves.length > 0) {
            return true;
          }
        }
      }
    }

    return false;
  }

  return getExecutableMoves(gameState, player.id, card.id).length > 0;
};

// Determine if a player can use the discard hand button.
// Rule: if a player has no legal moves, they can discard and redraw.
const canUseDiscardButton = (gameState: GameState, player: Player): boolean => {
  if (!gameState || gameState.phase !== 'playing') {
    return false;
  }

  const hasAnyLegalMove = player.hand.some(card => hasLegalMoveForCard(gameState, player, card));
  return !hasAnyLegalMove;
};

const Log = (message: string, ...args: any[]) => {
  console.log(`[GameController] ${message}`, ...args);
};

const getNineSplitStepQuestion = (direction: 'forward' | 'backward'): string =>
  `How many spaces ${direction} would you like to move one peg first?`;

const getNinePegSelectionPrompt = (direction: 'forward' | 'backward', steps: number): string =>
  `Which peg do you want to move ${direction} by ${steps}?`;

const GameController: React.FC<GameControllerProps> = ({ 
  playerNames, 
  playerTeams,
  numBoardSections,
  playerColors,
  
  // Multiplayer props
  isMultiplayer,
  isCurrentPlayerTurn,
  onMove,
  onUpdateGameState,
  gameStateOverride,
  localPlayerId,
  recentMoveHighlight,
  onHarnessSyncToServer,
  onHarnessCommitStateToServer
}) => {
  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    // If a game state override is provided (in multiplayer mode), use it
    if (gameStateOverride) {
      console.log("[GameController] Using gameStateOverride - board exists:", !!gameStateOverride.board);
      
      // Add debugging for board dimensions
      if (gameStateOverride.board) {
        // Log information about sections and spaces
        const sectionCount = gameStateOverride.board.sections?.length || 0;
        const spaceCount = gameStateOverride.board.allSpaces instanceof Map 
          ? gameStateOverride.board.allSpaces.size 
          : Object.keys(gameStateOverride.board.allSpaces).length;
        
        console.log(`[GameController] Board has ${sectionCount} sections and ${spaceCount} spaces`);
        
        // Log information about pegs
        if (gameStateOverride.players) {
          const totalPegs = gameStateOverride.players.reduce((total, player) => 
            total + (player.pegs?.length || 0), 0);
          console.log(`[GameController] Game has ${gameStateOverride.players.length} players with ${totalPegs} total pegs`);
        }
      }
      
      return gameStateOverride;
    }
    
    // Otherwise create a new initial game state
    console.log("[GameController] Creating new initial game state");
    // Log the player colors
    console.log("[GameController] Player colors:", playerColors);
    const initialState = createInitialGameState(playerNames, playerTeams, numBoardSections, playerColors);
    return initialState;
  });
  
  // Dev mode state
  const [devMode, setDevMode] = useState(false);
  const [movePegsMode, setMovePegsMode] = useState(false);
  const [preservePlayMode, setPreservePlayMode] = useState(false);
  
  // Add state for showing cards (for pass-and-play)
  const [showCards, setShowCards] = useState(false);
  
  // Calculate responsive scaling factor based on viewport size - simplified approach
  const calculateResponsiveScale = () => {
    // Get precise viewport dimensions
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    
    // Fixed base size for better consistency
    const boardSize = 1200;
    
    // Calculate ratio based on the smaller dimension to ensure it fits
    const ratio = Math.min(viewportWidth / boardSize, viewportHeight / boardSize);
    
    // Apply reasonable bounds
    return Math.min(Math.max(ratio, 0.5), 1.2);
  };

  // Initialize responsive scale factor
  const [responsiveScale, setResponsiveScale] = useState(calculateResponsiveScale());
  
  // Add zoom state for user-controlled zooming
  // Start with a larger initial zoom to fit the board better
  const [zoomLevel, setZoomLevel] = useState(1.2);
  
  // Add state to track when a pinch gesture is active
  const [isPinchActive, setIsPinchActive] = useState(false);
  
  // Add state variables for pinch tracking - using refs instead of state
  // to avoid triggering re-renders during pinch operation
  const initialDistanceRef = useRef(0);
  const initialScaleRef = useRef(0);
  const currentZoomRef = useRef(1.2); // Keep track of current zoom during pinch
  const handlePegSelectRef = useRef<(pegId: string) => void>(() => {});
  const handleSpaceSelectRef = useRef<(spaceId: string) => void>(() => {});
  
  // Create a ref to hold the last update time for debouncing
  const lastUpdateTimeRef = useRef(0);
  const requestAnimationFrameIdRef = useRef<number | null>(null);
  
  // Min and max zoom limits
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 9.99;
  
  // Function to handle zoom in
  const handleZoomIn = () => {
    // Skip if pinch gesture is active
    if (isPinchActive) return;
    
    setZoomLevel(prevZoom => {
      // Calculate zoom increment based on current zoom level for acceleration
      // Increase the multiplier further to make the zoom steps more noticeable (0.15 to 0.2)
      const zoomIncrement = Math.max(0.15, prevZoom * 0.2);
      return Math.min(prevZoom + zoomIncrement, MAX_ZOOM);
    });
  };
  
  // Function to handle zoom out
  const handleZoomOut = () => {
    // Skip if pinch gesture is active
    if (isPinchActive) return;
    
    setZoomLevel(prevZoom => {
      // Calculate zoom decrement based on current zoom level for acceleration
      // Increase the multiplier further to make the zoom steps more noticeable (0.15 to 0.2)
      const zoomDecrement = Math.max(0.15, prevZoom * 0.2);
      return Math.max(prevZoom - zoomDecrement, MIN_ZOOM);
    });
  };
  
  // Function to reset zoom to default
  const handleResetZoom = () => {
    // Skip if pinch gesture is active
    if (isPinchActive) return;
    
    setZoomLevel(1.2); // Reset to initial zoom level
    
    // Reset board position to center
    const boardElement = document.querySelector('.board');
    if (boardElement) {
      // Find the board component's container
      const boardContainer = document.querySelector('.board-container');
      
      // Reset transforms - this will make the Board component use its centered positioning
      if (boardContainer) {
        // Trigger a reflow to ensure the board's centerBoard function runs
        boardContainer.dispatchEvent(new Event('resetposition', { bubbles: true }));
      }
    }
  };

  // Touch handlers and zoom effect
  useEffect(() => {
    const handleResize = () => {
      setResponsiveScale(calculateResponsiveScale());
    };
    
    const handleWheel = (e: WheelEvent) => {
      // Skip if pinch gesture is active
      if (isPinchActive) return;
      
      // Check if the wheel event is on the board area
      const boardArea = document.querySelector('.board-area');
      if (boardArea && (boardArea.contains(e.target as Node) || boardArea === e.target)) {
        e.preventDefault();
        
        // Determine zoom direction (deltaY < 0 means zoom in)
        const zoomDirection = e.deltaY < 0 ? 1 : -1;
        
        // Calculate zoom factor based on current zoom level and event delta
        // Use a base factor and add acceleration based on current zoom and wheel speed
        const baseFactor = 0.01;
        const accelerationFactor = Math.min(0.02, Math.abs(e.deltaY) / 500);
        const zoomFactor = baseFactor + (accelerationFactor * Math.max(1, Math.sqrt(zoomLevel)));
        
        const zoomChange = zoomFactor * zoomDirection;
        
        setZoomLevel(prevZoom => {
          const newZoom = prevZoom + zoomChange;
          return Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
        });
      }
    };
    
    // Function to calculate distance between two touch points for this effect scope
    const getTouchDistanceLocal = (touches: TouchList): number => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    
    // Touch start handler scoped to this effect
    const handleTouchStartLocal = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Get the touch distance
        const distance = getTouchDistanceLocal(e.touches);
        
        if (distance > 0) {
          // Prevent default to disable browser's native pinch zoom
          e.preventDefault();
          
          // Mark that pinch is active
          setIsPinchActive(true);
          
          // Add class to document to indicate pinch zooming is active
          document.documentElement.classList.add('pinch-zooming');
          
          // Store initial values in refs
          initialDistanceRef.current = distance;
          initialScaleRef.current = zoomLevel;
          
          // Reset animation frame reference
          if (requestAnimationFrameIdRef.current !== null) {
            cancelAnimationFrame(requestAnimationFrameIdRef.current);
            requestAnimationFrameIdRef.current = null;
          }
          
          // Reset last update time
          lastUpdateTimeRef.current = Date.now();
        }
      }
    };
    
    // Function to smoothly update zoom using requestAnimationFrame
    const updateZoomSmoothLocal = (newZoom: number) => {
      // Cancel any pending animation frame
      if (requestAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(requestAnimationFrameIdRef.current);
      }
      
      // Get the board element
      const boardElement = document.querySelector('.board');
      if (!boardElement) {
        return;
      }
      
      // During pinch gesture, ONLY update the DOM directly (no React state updates)
      // This prevents fighting between React renders and direct DOM manipulation
      if (isPinchActive) {
        // Apply the new zoom directly for immediate feedback
        (boardElement as HTMLElement).style.transform = `translate(-50%, -50%) scale(${newZoom})`;
        
        // Store the current zoom in ref for when pinch ends
        currentZoomRef.current = newZoom;
      } else {
        // When not pinching, update both DOM and React state
        (boardElement as HTMLElement).style.transform = `translate(-50%, -50%) scale(${newZoom})`;
        setZoomLevel(newZoom);
      }
      
      // Clear the animation frame reference
      requestAnimationFrameIdRef.current = null;
    };
    
    // Touch move handler scoped to this effect
    const handleTouchMoveLocal = (e: TouchEvent) => {
      if (!isPinchActive || e.touches.length !== 2) return;
      
      // Prevent default browser behavior
      e.preventDefault();
      
      // Get current touch distance
      const currentDistance = getTouchDistanceLocal(e.touches);
      
      if (currentDistance > 0 && initialDistanceRef.current > 0) {
        // Calculate new scale based on distance change
        const scaleFactor = currentDistance / initialDistanceRef.current;
        const newZoom = Math.min(Math.max(initialScaleRef.current * scaleFactor, MIN_ZOOM), MAX_ZOOM);
        
        // Throttle updates to prevent too many redraws
        const now = Date.now();
        if (now - lastUpdateTimeRef.current > 16) { // Aiming for ~60fps
          // Update the zoom smoothly
          updateZoomSmoothLocal(newZoom);
          lastUpdateTimeRef.current = now;
        }
      }
    };
    
    // Touch end handler scoped to this effect
    const handleTouchEndLocal = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        // If pinch was active but now ended, update React state with final zoom level
        if (isPinchActive) {
          // Update the React state to match the final zoom level
          setZoomLevel(currentZoomRef.current);
        }
        
        // Reset pinch state when less than 2 fingers remain
        setIsPinchActive(false);
        
        // Remove pinch zooming class
        document.documentElement.classList.remove('pinch-zooming');
        
        // Cancel any pending animation
        if (requestAnimationFrameIdRef.current !== null) {
          cancelAnimationFrame(requestAnimationFrameIdRef.current);
          requestAnimationFrameIdRef.current = null;
        }
      }
    };
    
    // Apply event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    // Add touch event listeners directly to the board area
    const boardArea = document.querySelector('.board-area');
    if (boardArea) {
      boardArea.addEventListener('touchstart', handleTouchStartLocal as unknown as EventListener, { passive: false });
      boardArea.addEventListener('touchmove', handleTouchMoveLocal as unknown as EventListener, { passive: false });
      boardArea.addEventListener('touchend', handleTouchEndLocal as unknown as EventListener);
    }
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheel);
      
      if (boardArea) {
        boardArea.removeEventListener('touchstart', handleTouchStartLocal as unknown as EventListener);
        boardArea.removeEventListener('touchmove', handleTouchMoveLocal as unknown as EventListener);
        boardArea.removeEventListener('touchend', handleTouchEndLocal as unknown as EventListener);
      }
      
      // Cancel any pending animation frame on cleanup
      if (requestAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(requestAnimationFrameIdRef.current);
      }
    };
  }, [zoomLevel, isPinchActive, MIN_ZOOM, MAX_ZOOM]); // Dependencies that don't include the handlers
  
  // Debug useEffect for peg tracking
  useEffect(() => {
    // Add debug logging for pegs when gameState changes
    if (gameState && gameState.board) {
      // Count pegs in each space
      const pegCountsBySpace: Record<string, number> = {};
      
      // Function to count pegs
      const countPegs = () => {
        if (!gameState.board.allSpaces) return;
        
        // Count pegs in each space
        let totalPegs = 0;
        const spaces = gameState.board.allSpaces instanceof Map 
          ? Array.from(gameState.board.allSpaces.values())
          : Object.values(gameState.board.allSpaces);
        
        spaces.forEach((space: any) => {
          if (space.pegs && Array.isArray(space.pegs)) {
            pegCountsBySpace[space.id] = space.pegs.length;
            totalPegs += space.pegs.length;
          }
        });
        
        // Find spaces with pegs
        const spacesWithPegs = Object.entries(pegCountsBySpace)
          .filter(([_, count]) => count > 0)
          .map(([id, count]) => `${id}: ${count}`)
          .join(', ');
        
        console.log(`[GameController] Board has ${totalPegs} total pegs. Spaces with pegs: ${spacesWithPegs || 'none'}`);
        
        // Look specifically for a starting space
        const startingSpace = spaces.find((s: any) => 
          s.type === 'starting' || (s.id && s.id.includes('_starting')));
        
        if (startingSpace) {
          console.log(`[GameController] Starting space (${(startingSpace as any).id}) has ${(startingSpace as any).pegs?.length || 0} pegs`);
          if ((startingSpace as any).pegs && (startingSpace as any).pegs.length > 0) {
            console.log(`[GameController] Sample pegs: ${(startingSpace as any).pegs.slice(0, 3).join(', ')}`);
          }
        } else {
          console.log(`[GameController] No starting space found!`);
        }
      };
      
      countPegs();
    }
  }, [gameState]);
  
  // UI state
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedPegId, setSelectedPegId] = useState<string | null>(null);
  const [selectableSpaceIds, setSelectableSpaceIds] = useState<string[]>([]);
  const [selectablePegIds, setSelectablePegIds] = useState<string[]>([]);
  const [promptMessage, setPromptMessage] = useState<string>('');
  
  // Add new state for nine card handling
  const [nineCardState, setNineCardState] = useState<NineCardState>({
    state: 'INITIAL',
    firstMoveComplete: false
  });
  
  // Add new state for seven card handling
  const [sevenCardState, setSevenCardState] = useState<SevenCardState>({
    state: 'INITIAL',
    isSplit: false
  });
  
  // Add state for bump message
  const [bumpMessage, setBumpMessage] = useState<string | undefined>();
  
  // Get current player
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const currentPlayerColor = playerColors[currentPlayer?.id] || '#0f6b74';
  const localMultiplayerPlayer = isMultiplayer && localPlayerId
    ? gameState.players.find(player => player.id === localPlayerId)
    : undefined;
  const handOwner = isMultiplayer ? (localMultiplayerPlayer || currentPlayer) : currentPlayer;
  const handOwnerColor = playerColors[handOwner?.id] || currentPlayerColor;
  const shouldShowDiscardButton = isMultiplayer
    ? Boolean(isCurrentPlayerTurn) && canUseDiscardButton(gameState, currentPlayer)
    : canUseDiscardButton(gameState, currentPlayer) && showCards;
  
  // Add new state for floating elements
  const [floatingElements, setFloatingElements] = useState<FloatingElement[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  
  // Add new state to track when first move is complete
  const [firstMoveCompleted, setFirstMoveCompleted] = useState<boolean>(false);
  
  // Add state for debug logging
  const [, setDebugLogs] = useState<string[]>([]);
  
  // Add these to the existing state variables
  const [castlePromptState, setCastlePromptState] = useState<{
    isActive: boolean;
    pegId: string;
    regularMove?: Move;
    castleMove?: Move;
  }>({
    isActive: false,
    pegId: ''
  });
  
  // Add logging function
  const logDebug = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(`[DEBUG] ${logMessage}`);
    setDebugLogs(prev => [...prev, logMessage]);
  };
  
  // Add a function to update game state and notify other players in multiplayer mode
  const updateGameState = useCallback((newState: GameState) => {
    setGameState(newState);
    
    // Keep legacy synchronization path available when onMove is not being used.
    if (isMultiplayer && onUpdateGameState && !onMove) {
      onUpdateGameState(newState);
    }
  }, [isMultiplayer, onMove, onUpdateGameState]);

  const clearInteractionState = useCallback(() => {
    setSelectedCardId(null);
    setSelectedPegId(null);
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    setPromptMessage('');
    setCastlePromptState({ isActive: false, pegId: '' });
    setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
    setSevenCardState({ state: 'INITIAL', isSplit: false });
  }, []);

  // Keep multiplayer snapshots authoritative without remounting the controller.
  useEffect(() => {
    if (!isMultiplayer || !gameStateOverride) {
      return;
    }

    setGameState(previousState => (previousState === gameStateOverride ? previousState : gameStateOverride));
    clearInteractionState();
    setBumpMessage(undefined);
  }, [isMultiplayer, gameStateOverride, clearInteractionState]);

  const runHarnessAutoPlaySingleTurn = (): HarnessActionResult<{
    action: 'play_move' | 'discard_hand' | 'game_over';
    playerId: string;
    cardId?: string;
    pegId?: string;
    destination?: string;
  }> => {
    interface AutoPlayCandidate {
      priority: number;
      sequence: number;
      card: Card;
      firstMove: Move;
      secondMove?: Move;
      endTurnAction: 'play_move' | 'skip_second_move';
    }

    const expandMoves = (moves: Move[]): Move[] => {
      const expanded: Move[] = [];
      moves.forEach(move => {
        if (!move.destinations || move.destinations.length === 0) {
          return;
        }

        move.destinations.forEach(destination => {
          expanded.push({
            ...move,
            destinations: [destination]
          });
        });
      });

      return expanded;
    };

    const cardPriority = (card: Card): number => {
      if (card.rank === '9') {
        return 40;
      }

      if (card.rank === '7') {
        return 35;
      }

      if (card.rank === 'joker') {
        return 30;
      }

      if (card.rank === 'ace') {
        return 28;
      }

      if (card.isFace) {
        return 24;
      }

      if (card.rank === '8') {
        return 18;
      }

      return 16;
    };

    const scoreMove = (state: GameState, player: Player, move: Move): number => {
      const destinationId = move.destinations[0];
      const destinationSpace = state.board.allSpaces.get(destinationId);
      const fromSpace = findSpaceForPeg(state, move.pegId);
      const playerSectionIndex = state.board.sections.find(section =>
        section.playerIds?.includes(player.id)
      )?.index;

      if (!destinationSpace) {
        return -1_000;
      }

      const homePegCount = player.pegs.reduce((count, pegId) => {
        const pegSpace = findSpaceForPeg(state, pegId);
        return pegSpace?.type === 'home' ? count + 1 : count;
      }, 0);

      let score = 0;

      if (destinationSpace.type === 'castle') {
        score += 1_000 + (destinationSpace.index * 140);
        if (fromSpace?.type === 'castle') {
          score += 240;
        }
      }

      if (
        fromSpace?.type === 'home' &&
        (destinationSpace.type === 'normal' || destinationSpace.type === 'entrance' || destinationSpace.type === 'corner')
      ) {
        score += 620;
      }

      if (homePegCount > 0 && fromSpace?.type !== 'home') {
        score -= 140;
      }

      if (destinationSpace.type === 'entrance' && destinationSpace.sectionIndex === playerSectionIndex && destinationSpace.index === 3) {
        score += 200;
      }

      if (destinationSpace.type === 'normal' || destinationSpace.type === 'entrance' || destinationSpace.type === 'corner') {
        score += 45;
        if (destinationSpace.sectionIndex === playerSectionIndex) {
          score += 30;
        }
      }

      const bumpCount = destinationSpace.pegs.filter(existingPegId => {
        const [pegPlayerId] = existingPegId.split('-peg-');
        return pegPlayerId !== player.id;
      }).length;
      if (bumpCount > 0) {
        score += 180 + (bumpCount * 40);
      }

      return score;
    };

    const drawReplacementHand = (state: GameState) => {
      const turnPlayer = state.players[state.currentPlayerIndex];
      state.discardPile.push(...turnPlayer.hand);
      turnPlayer.hand = [];

      for (let index = 0; index < 5; index += 1) {
        if (state.drawPile.length === 0 && state.discardPile.length > 0) {
          state.drawPile = [...state.discardPile].sort(() => Math.random() - 0.5);
          state.discardPile = [];
        }

        if (state.drawPile.length > 0) {
          turnPlayer.hand.push(state.drawPile.pop()!);
        }
      }
    };

    try {
      const baselineState = normalizeGameState(cloneGameState(gameState));
      const turnPlayer = baselineState.players[baselineState.currentPlayerIndex];

      if (!turnPlayer) {
        return {
          ok: false,
          error: 'Current player is unavailable for auto-play.'
        };
      }

      if (baselineState.phase !== 'playing') {
        if (baselineState.phase === 'gameOver' || isGameOver(baselineState)) {
          updateGameState({
            ...baselineState,
            phase: 'gameOver'
          });
          clearInteractionState();
          return {
            ok: true,
            value: {
              action: 'game_over',
              playerId: turnPlayer.id
            }
          };
        }

        return {
          ok: false,
          error: `Auto-play is only available during the playing phase. Current phase: ${baselineState.phase}`
        };
      }

      let sequence = 0;
      const candidates: AutoPlayCandidate[] = [];
      const pushCandidate = (candidate: Omit<AutoPlayCandidate, 'sequence'>) => {
        candidates.push({
          ...candidate,
          sequence
        });
        sequence += 1;
      };

      turnPlayer.hand.forEach(card => {
        if (card.rank === '9') {
          const regularNineMoves = expandMoves(
            getPossibleMoves(baselineState, turnPlayer.id, card.id, {
              direction: 'forward',
              steps: 9
            })
          ).map(move => ({
            ...move,
            metadata: {
              ...move.metadata,
              nineCardMove: {
                direction: 'forward' as const,
                steps: 9,
                isFirstMove: false
              }
            }
          }));

          regularNineMoves.forEach(move => {
            pushCandidate({
              priority: cardPriority(card) + scoreMove(baselineState, turnPlayer, move),
              card,
              firstMove: move,
              endTurnAction: 'play_move'
            });
          });

          (['forward', 'backward'] as const).forEach(direction => {
            for (let firstSteps = 1; firstSteps <= 8; firstSteps += 1) {
              const firstMoves = expandMoves(
                getPossibleMoves(baselineState, turnPlayer.id, card.id, {
                  direction,
                  steps: firstSteps
                })
              ).map(move => ({
                ...move,
                metadata: {
                  ...move.metadata,
                  nineCardMove: {
                    direction,
                    steps: firstSteps,
                    isFirstMove: true
                  }
                }
              }));

              firstMoves.forEach(firstMove => {
                const firstMoveState = normalizeGameState(
                  cloneGameState(applyMove(cloneGameState(baselineState), firstMove).newState)
                );

                const secondDirection: 'forward' | 'backward' = direction === 'forward'
                  ? 'backward'
                  : 'forward';
                const secondSteps = 9 - firstSteps;

                const secondMoves = expandMoves(
                  getPossibleMoves(firstMoveState, turnPlayer.id, card.id, {
                    direction: secondDirection,
                    steps: secondSteps,
                    isSecondMove: true,
                    firstMovePegId: firstMove.pegId
                  })
                ).map(move => ({
                  ...move,
                  metadata: {
                    ...move.metadata,
                    nineCardMove: {
                      direction: secondDirection,
                      steps: secondSteps,
                      isFirstMove: false
                    }
                  }
                }));

                if (secondMoves.length === 0) {
                  return;
                }

                secondMoves.forEach(secondMove => {
                  pushCandidate({
                    priority:
                      cardPriority(card) +
                      45 +
                      scoreMove(baselineState, turnPlayer, firstMove) +
                      scoreMove(firstMoveState, turnPlayer, secondMove),
                    card,
                    firstMove,
                    secondMove,
                    endTurnAction: 'play_move'
                  });
                });
              });
            }
          });
          return;
        }

        if (card.rank === '7') {
          const regularSevenMoves = expandMoves(
            getPossibleMoves(baselineState, turnPlayer.id, card.id)
          );

          regularSevenMoves.forEach(move => {
            pushCandidate({
              priority: cardPriority(card) + scoreMove(baselineState, turnPlayer, move),
              card,
              firstMove: move,
              endTurnAction: 'play_move'
            });
          });

          for (let firstSteps = 1; firstSteps <= 6; firstSteps += 1) {
            const firstMoves = expandMoves(
              getPossibleMoves(baselineState, turnPlayer.id, card.id, {
                steps: firstSteps
              })
            ).map(move => ({
              ...move,
              metadata: {
                ...move.metadata,
                sevenCardMove: {
                  steps: firstSteps,
                  isFirstMove: true
                }
              }
            }));

            firstMoves.forEach(firstMove => {
              const firstMoveState = normalizeGameState(
                cloneGameState(applyMove(cloneGameState(baselineState), firstMove).newState)
              );

              const secondSteps = 7 - firstSteps;
              const secondMoves = expandMoves(
                getPossibleMoves(firstMoveState, turnPlayer.id, card.id, {
                  steps: secondSteps,
                  isSecondMove: true,
                  firstMovePegId: firstMove.pegId
                })
              ).map(move => ({
                ...move,
                metadata: {
                  ...move.metadata,
                  sevenCardMove: {
                    steps: secondSteps,
                    isFirstMove: false
                  }
                }
              }));

              secondMoves.forEach(secondMove => {
                pushCandidate({
                  priority:
                    cardPriority(card) +
                    40 +
                    scoreMove(baselineState, turnPlayer, firstMove) +
                    scoreMove(firstMoveState, turnPlayer, secondMove),
                  card,
                  firstMove,
                  secondMove,
                  endTurnAction: 'play_move'
                });
              });
            });
          }
          return;
        }

        const regularMoves = expandMoves(
          getPossibleMoves(baselineState, turnPlayer.id, card.id)
        );

        regularMoves.forEach(move => {
          pushCandidate({
            priority: cardPriority(card) + scoreMove(baselineState, turnPlayer, move),
            card,
            firstMove: move,
            endTurnAction: 'play_move'
          });
        });
      });

      if (candidates.length === 0) {
        if (!canUseDiscardButton(baselineState, turnPlayer)) {
          return {
            ok: false,
            error: `No legal moves found for ${turnPlayer.id} and discard is unavailable.`
          };
        }

        const discardedState = normalizeGameState(cloneGameState(baselineState));
        drawReplacementHand(discardedState);
        handleEndTurn(discardedState, 'discard_hand');
        clearInteractionState();
        return {
          ok: true,
          value: {
            action: 'discard_hand',
            playerId: turnPlayer.id
          }
        };
      }

      candidates.sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return left.sequence - right.sequence;
      });

      const selectedCandidate = candidates[0];
      let nextState = normalizeGameState(cloneGameState(baselineState));

      const firstResult = applyMove(nextState, selectedCandidate.firstMove);
      nextState = normalizeGameState(cloneGameState(firstResult.newState));
      let finalMove = selectedCandidate.firstMove;

      if (selectedCandidate.secondMove) {
        const secondResult = applyMove(nextState, selectedCandidate.secondMove);
        nextState = normalizeGameState(cloneGameState(secondResult.newState));
        finalMove = selectedCandidate.secondMove;
      }

      if (isGameOver(nextState)) {
        const gameOverState: GameState = {
          ...nextState,
          phase: 'gameOver'
        };

        if (isMultiplayer && onMove) {
          setGameState(gameOverState);
          onMove({
            type: 'play_move',
            nextGameState: gameOverState
          });
        } else {
          updateGameState(gameOverState);
        }

        clearInteractionState();
        return {
          ok: true,
          value: {
            action: 'game_over',
            playerId: turnPlayer.id,
            cardId: selectedCandidate.card.id,
            pegId: finalMove.pegId,
            destination: finalMove.destinations[0]
          }
        };
      }

      handleEndTurn(nextState, selectedCandidate.endTurnAction);
      clearInteractionState();

      return {
        ok: true,
        value: {
          action: 'play_move',
          playerId: turnPlayer.id,
          cardId: selectedCandidate.card.id,
          pegId: finalMove.pegId,
          destination: finalMove.destinations[0]
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to auto-play a single turn.'
      };
    }
  };

  useEffect(() => {
    const mode = isMultiplayer ? 'online' : 'offline';

    const api: JokerPursuitHarnessApi = {
      version: '1.0',
      mode,
      getSnapshot: () => ({
        mode,
        timestamp: Date.now(),
        gameState: serializeGameState(gameState),
        currentPlayerId: gameState.players[gameState.currentPlayerIndex]?.id,
        selectedCardId,
        selectedPegId,
        selectableSpaceIds: [...selectableSpaceIds],
        selectablePegIds: [...selectablePegIds],
        promptMessage,
        metadata: {
          devMode,
          movePegsMode,
          preservePlayMode,
          nineCardState,
          sevenCardState
        }
      }),
      replaceGameState: (state: GameState) => {
        try {
          const nextState = normalizeGameState(cloneGameState(state));
          updateGameState(nextState);
          clearInteractionState();
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to replace game state.'
          };
        }
      },
      setCurrentPlayer: (playerId: string) => {
        const result = setCurrentPlayerById(gameState, playerId);
        if (!result.ok || !result.value) {
          return { ok: false, error: result.error };
        }

        updateGameState(result.value);
        clearInteractionState();
        return { ok: true };
      },
      setPlayerHand: (playerId: string, cards: HarnessCardInput[]) => {
        const result = setPlayerHandById(gameState, playerId, cards);
        if (!result.ok || !result.value) {
          return { ok: false, error: result.error };
        }

        updateGameState(result.value);
        clearInteractionState();
        return { ok: true };
      },
      placePeg: (pegId: string, spaceId: string) => {
        const result = placePegOnBoard(gameState, pegId, spaceId);
        if (!result.ok || !result.value) {
          return { ok: false, error: result.error };
        }

        updateGameState(result.value);
        return { ok: true };
      },
      setPegPositions: (placements: Record<string, string>) => {
        const result = setPegPositionsOnBoard(gameState, placements);
        if (!result.ok || !result.value) {
          return { ok: false, error: result.error };
        }

        updateGameState(result.value);
        return { ok: true };
      },
      listPossibleMoves: (
        playerId: string,
        cardId: string,
        options?: HarnessMoveOptions
      ) => {
        try {
          const moves = getPossibleMoves(gameState, playerId, cardId, options);
          return { ok: true, value: moves };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to list possible moves.'
          };
        }
      },
      selectPeg: (pegId: string) => {
        handlePegSelectRef.current(pegId);
        return { ok: true };
      },
      selectSpace: (spaceId: string) => {
        handleSpaceSelectRef.current(spaceId);
        return { ok: true };
      },
      applyMove: (move: Move) => {
        try {
          const result = applyMove(gameState, move);
          updateGameState(result.newState);
          return {
            ok: true,
            value: serializeGameState(result.newState)
          };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to apply move.'
          };
        }
      },
      selectCard: (cardId: string | null) => {
        setSelectedCardId(cardId);
        return { ok: true };
      },
      clearInteraction: () => {
        clearInteractionState();
        return { ok: true };
      },
      setDevFlags: (flags) => {
        if (typeof flags.devMode === 'boolean') {
          setDevMode(flags.devMode);
        }
        if (typeof flags.movePegsMode === 'boolean') {
          setMovePegsMode(flags.movePegsMode);
        }
        if (typeof flags.preservePlayMode === 'boolean') {
          setPreservePlayMode(flags.preservePlayMode);
        }
        return { ok: true };
      },
      autoPlaySingleTurn: () => {
        return runHarnessAutoPlaySingleTurn();
      },
      syncToServer: async () => {
        if (!onHarnessSyncToServer) {
          return {
            ok: false,
            error: 'syncToServer is only available in multiplayer mode.'
          };
        }

        return onHarnessSyncToServer();
      },
      commitGameStateToServer: async (nextState?: GameState) => {
        if (!onHarnessCommitStateToServer) {
          return {
            ok: false,
            error: 'commitGameStateToServer is only available in multiplayer mode.'
          };
        }

        const candidate = normalizeGameState(cloneGameState(nextState || gameState));
        const commitResult = await onHarnessCommitStateToServer(candidate);
        if (commitResult.ok) {
          updateGameState(candidate);
          clearInteractionState();
        }

        return commitResult;
      }
    };

    window.__JP_HARNESS__ = api;

    return () => {
      if (window.__JP_HARNESS__ === api) {
        delete window.__JP_HARNESS__;
      }
    };
  // Harness bridge intentionally closes over live controller handlers/state each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameState,
    isMultiplayer,
    selectedCardId,
    selectedPegId,
    selectableSpaceIds,
    selectablePegIds,
    promptMessage,
    devMode,
    movePegsMode,
    preservePlayMode,
    nineCardState,
    sevenCardState,
    updateGameState,
    clearInteractionState,
    onHarnessSyncToServer,
    onHarnessCommitStateToServer
  ]);
  
  useEffect(() => {
    // Create initial floating elements
    const elements: FloatingElement[] = [];
    // Add 10 cards
    for (let i = 0; i < 10; i++) {
      elements.push({
        id: i,
        type: 'card',
        color: '#ffffff',
        x: Math.random() * 100,
        y: Math.random() * 100,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5
      });
    }
    // Add 8 pegs with different colors
    const pegColors = ['#FF5733', '#33A1FF', '#33FF57', '#F033FF', '#FFFF33', '#FF33A8', '#33FFEC', '#FF8C33'];
    for (let i = 0; i < 8; i++) {
      elements.push({
        id: i + 10,
        type: 'peg',
        color: pegColors[i],
        x: Math.random() * 100,
        y: Math.random() * 100,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5
      });
    }
    setFloatingElements(elements);
    
    // Log that the game has loaded
    logDebug("Game component loaded");
  }, []);
  
  // Add an effect to log current game state when it changes
  useEffect(() => {
    // Log current player info when game state changes
    if (gameState.phase === 'playing') {
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      logDebug(`Current player: ${currentPlayer.name} (${currentPlayer.id})`);
      logDebug(`Hand: ${currentPlayer.hand.map(c => `${c.rank} of ${c.suit}`).join(', ')}`);
    }
  }, [gameState.currentPlayerIndex, gameState.phase, gameState.players]);
  
  // Calculate selectable spaces when a card is selected
  const calculateSelectableSpaces = (cardId: string) => {
    const selectedCard = currentPlayer?.hand.find(c => c.id === cardId);
    
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer?.id, 
      cardId,
      selectedCard?.rank === '9' ? {
        direction: nineCardState.direction,
        steps: nineCardState.steps,
        isSecondMove: nineCardState.firstMoveComplete,
        firstMovePegId: nineCardState.firstMovePegId
      } : selectedCard?.rank === '7' && sevenCardState.isSplit ? {
        steps: sevenCardState.firstMoveSteps,
        isSecondMove: sevenCardState.firstMoveSteps !== undefined,
        firstMovePegId: sevenCardState.firstMovePegId
      } : undefined
    );
    const spaceIds = new Set<string>();
    const pegIds = new Set<string>();
    
    moves.forEach(move => {
      // For the second part of a 7 card split, we need to track selectable pegs
      if (selectedCard?.rank === '7' && sevenCardState.isSplit && sevenCardState.firstMoveSteps !== undefined) {
        pegIds.add(move.pegId);
      }
      move.destinations.forEach(dest => spaceIds.add(dest));
    });
    
    // Update selectable peg IDs if needed
    if (pegIds.size > 0) {
      setSelectablePegIds(Array.from(pegIds));
    }
    
    return Array.from(spaceIds);
  };
  
  // Handle shuffling and dealing cards
  const handleShuffleAndDeal = () => {
    setIsShuffling(true);
    
    // Wait for animation to complete before actually shuffling
    setTimeout(() => {
      // Use the existing shuffleAndDealCards function
      const newState = shuffleAndDealCards(gameState);
      updateGameState(newState);
      setIsShuffling(false);
    }, 3000); // 3 seconds for the animation
  };
  
  // Handle card selection
  const handleCardSelect = (cardId: string) => {
    // If in multiplayer mode and not current player's turn, do nothing
    if (isMultiplayer && !isCurrentPlayerTurn) {
      return;
    }
    
    // If a card is already selected, reset everything
    if (selectedCardId) {
      setPromptMessage('');
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setNineCardState({ state: 'INITIAL', firstMoveComplete: false, splitSelected: false });
      setSevenCardState({ state: 'INITIAL', isSplit: false });
      return;
    }
    
    // First check for special cards with additional options
    const selectedCard = gameState?.players[gameState?.currentPlayerIndex]?.hand.find(card => card.id === cardId);
    if (selectedCard) {
      logDebug(`Selected card: ${selectedCard.rank} of ${selectedCard.suit}`);
      
      // Set card as selected
      setSelectedCardId(cardId);
      
      // Specific prompt for joker card
      if (selectedCard.rank === 'joker') {
        logDebug("Joker card selected - prompting user to select their own peg first");
        setPromptMessage("Click on one of your pegs to select which one to teleport");
      } 
      // Special handling for 7 card
      else if (selectedCard.rank === '7') {
        logDebug("7 card selected - offering move or split options");
        setPromptMessage('Choose an option: "Move 7" or "Split 7"');
      }
      // Special handling for 9 card
      else if (selectedCard.rank === '9') {
        logDebug("9 card selected - offering regular or split options");
        setPromptMessage('Choose an Option:');
      } 
      else {
        // Regular card handling
        setPromptMessage("Click on one of your pegs to apply this card's move");
      }
      
      setSelectedPegId(null);
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setNineCardState({ state: 'INITIAL', firstMoveComplete: false, splitSelected: false });
      setSevenCardState({ state: 'INITIAL', isSplit: false });
    }
  };
  
  // Handle nine card option selection (regular move or split)
  const handleNineCardOption = (option: 'move' | 'split') => {
    Log(`9 card option selected: ${option}`);
    
    // Regular forward 9 spaces move
    if (option === 'move') {
      // For regular move, we don't need the direction selection or steps selection
      // Set a special state that indicates this is a regular move, not a split
      setNineCardState(prev => ({
        ...prev,
        state: 'STEPS_CHOSEN', // Skip to this state directly
        direction: 'forward',
        firstMoveComplete: false,
        steps: 9, // Set steps directly to 9
        splitSelected: false // Explicitly set this to false
      }));
      
      // Skip the direction and steps selection entirely and go straight to peg selection
      if (selectedCardId) {
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        const moves = getPossibleMoves(gameState, currentPlayer?.id, selectedCardId, {
          direction: 'forward', 
          steps: 9
        });
        
        // Get unique peg IDs from all possible moves
        const pegIds = new Set<string>();
        moves.forEach(move => pegIds.add(move.pegId));
        
        setSelectablePegIds(Array.from(pegIds));
        setPromptMessage(`Choose a peg to move 9 spaces forward`);
      }
    } 
    // Split move (part forward, part backward)
    else if (option === 'split') {
      // For split, show direction buttons
      setNineCardState(prev => ({
        ...prev,
        state: 'INITIAL',
        firstMoveComplete: false,
        direction: undefined, // Explicitly reset direction to force direction selection
        splitSelected: true // Set this to true to track that split was selected
      }));
      
      setPromptMessage('Choose the direction for the first part of the split: "Forward" or "Backward"');
    }
  };
  
  // Handle nine card direction selection
  const handleNineCardDirection = (direction: 'forward' | 'backward') => {
    Log(`Nine card direction selected: ${direction}`);
    setNineCardState(prev => ({ 
      ...prev, 
      state: 'SPLIT_SELECT_STEPS',
      direction 
    }));
    setPromptMessage(getNineSplitStepQuestion(direction));
  };
  
  // Handle nine card steps selection
  const handleNineCardSteps = (steps: number) => {
    if (steps < 1 || steps > 8) {
      setPromptMessage("Please select a number between 1 and 8");
      return;
    }
    
    setNineCardState(prev => ({ 
      ...prev, 
      state: 'STEPS_CHOSEN',
      steps 
    }));

    const firstMoveDirection = nineCardState.direction ?? 'forward';
    setPromptMessage(getNinePegSelectionPrompt(firstMoveDirection, steps));
    
    // Calculate selectable spaces for the first move
    if (selectedCardId) {
      setTimeout(() => {
        const spaces = calculateSelectableSpaces(selectedCardId);
        setSelectableSpaceIds(spaces);
      }, 0);
    }
  };
  
  // Handle seven card option selection (move 1 peg or split between 2 pegs)
  const handleSevenCardOption = (option: 'move' | 'split') => {
    // Move 7 spaces (straightforward)
    if (option === 'move') {
      if (selectedCardId) {
        // For regular 7 card move, just show the selectable pegs
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        const moves = getPossibleMoves(gameState, currentPlayer?.id, selectedCardId);
        
        // Get unique peg IDs from all possible moves
        const pegIds = new Set<string>();
        moves.forEach(move => pegIds.add(move.pegId));
        
        setSelectablePegIds(Array.from(pegIds));
        setPromptMessage(`Choose a peg to move 7 spaces`);
        setSevenCardState(prev => ({ ...prev, state: 'INITIAL', isSplit: false }));
      }
    }
    // Split the 7 into two moves
    else if (option === 'split') {
      setPromptMessage(`Choose how many spaces to move the first peg (1-6)`);
      setSevenCardState(prev => ({ ...prev, state: 'SPLIT_SELECTED', isSplit: true }));
    }
  };
  
  // Handle seven card steps selection for the first peg
  const handleSevenCardSteps = (steps: number) => {
    // Validate steps (must be between 1 and 6)
    if (steps < 1 || steps > 6) {
      return;
    }
    
    // Calculate remaining steps
    const remainingSteps = 7 - steps;
    
    // Clear previous selectable spaces/pegs
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    
    // Update seven card state
    setSevenCardState(prev => ({
      ...prev,
      state: 'STEPS_CHOSEN',
      firstMoveSteps: steps,
      remainingSteps
    }));
    
    // Calculate selectable pegs for the first move
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    
    if (selectedCardId) {
      // Get possible moves for the first part
      const moves = getPossibleMoves(gameState, currentPlayer?.id, selectedCardId, { steps });
      
      // Identify selectable pegs
      const pegIds = new Set<string>();
      moves.forEach(move => pegIds.add(move.pegId));
      
      // Set selectable pegs
      const selectablePegIdsArray = Array.from(pegIds);
      setSelectablePegIds(selectablePegIdsArray);
      
      if (selectablePegIdsArray.length === 0) {
        setPromptMessage(`No valid moves available for ${steps} spaces. Choose a different number or try a regular move.`);
        setSevenCardState(prev => ({ ...prev, state: 'INITIAL', isSplit: false }));
        return;
      }
    }
    
    // Update prompt
    setPromptMessage(`Choose a peg to move ${steps} spaces for the first move`);
  };
  
  // Modify the useEffect to properly setup second move of 7 card split
  useEffect(() => {
    if (firstMoveCompleted) {
      Log('First move completed, setting up second move');
      
      // For 7 card split second move
      if (sevenCardState.state === 'FIRST_MOVE_COMPLETE' && sevenCardState.isSplit) {
        Log('Setting up 7 card split second move');
        Log('7 card state:', sevenCardState);
        
        // Ensure we have the necessary data for the second move
        if (!sevenCardState.remainingSteps || !selectedCardId || !sevenCardState.firstMovePegId) {
          Log('Missing data for 7 card second move setup');
          return;
        }
        
        // Get the current player
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        
        // Check if the selected card is still in the player's hand
        const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
        if (!selectedCard) {
          Log(`Selected card ${selectedCardId} not found in player's hand. This should be ok since we modified applyMove to keep the card.`);
          // No need to find a fallback card here - we'll handle that when the peg is selected
        } else {
          Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
        }
        
        // Select all pegs EXCEPT the one used for the first move
        const selectablePegs = currentPlayer?.pegs.filter(pegId => {
          // Skip the peg used in the first move
          if (pegId === sevenCardState.firstMovePegId) {
            Log(`Skipping peg ${pegId} as it was used for first move`);
            return false;
          }
          
          // Skip pegs in home slots (can't be moved with numbered cards)
          const pegSpace = findSpaceForPeg(gameState, pegId);
          if (!pegSpace) {
            Log(`Skipping peg ${pegId} as it was not found on the board`);
            return false;
          }
          
          if (pegSpace.type === 'home') {
            Log(`Skipping peg ${pegId} as it's in a home space`);
            return false;
          }
          
          if (pegSpace.type === 'castle') {
            Log(`Skipping peg ${pegId} as it's in a castle space`);
            return false;
          }
          
          Log(`Peg ${pegId} is selectable for second move (at space ${pegSpace.id})`);
          return true;
        });
        
        Log(`Found ${selectablePegs.length} possible pegs for second move (excluding first move peg and home/castle pegs)`);
        
        if (selectablePegs.length === 0) {
          Log('No selectable pegs for second move');
          setPromptMessage(`No valid pegs available for the remaining ${sevenCardState.remainingSteps} steps. End your turn.`);
        } else {
          // Set the selectable pegs and update UI state
          setSelectablePegIds(selectablePegs);
          setSevenCardState(prev => ({
            ...prev,
            state: 'SECOND_MOVE_READY',
            selectablePegsForSecondMove: selectablePegs
          }));
          setPromptMessage(`Select a different peg to move the remaining ${sevenCardState.remainingSteps} steps.`);
        }
      }
      // For 9 card split second move
      else if (nineCardState.state === 'FIRST_MOVE_COMPLETE' && nineCardState.firstMoveComplete) {
        Log('Setting up 9 card split second move');
        Log('9 card state:', nineCardState);
        
        // Ensure we have the necessary data for the second move
        if (!nineCardState.remainingSteps || !selectedCardId || !nineCardState.firstMovePegId || !nineCardState.direction) {
          Log('Missing data for 9 card second move setup');
          return;
        }
        
        // Get the current player
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        
        // Check if the selected card is still in the player's hand
        const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
        if (!selectedCard) {
          Log(`Selected card ${selectedCardId} not found in player's hand. This should be ok since we modified applyMove to keep the card.`);
          // No need to find a fallback card here - we'll handle that when the peg is selected
        } else {
          Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
        }
        
        // For the second move of a 9 card, use the opposite direction
        const secondMoveDirection: 'forward' | 'backward' = nineCardState.direction === 'forward' ? 'backward' : 'forward';
        Log(`First move direction: ${nineCardState.direction}, second move direction: ${secondMoveDirection}`);
        
        // Select all pegs EXCEPT the one used for the first move
        const selectablePegs = currentPlayer?.pegs.filter(pegId => {
          // Skip the peg used in the first move
          if (pegId === nineCardState.firstMovePegId) {
            Log(`Skipping peg ${pegId} as it was used for first move`);
            return false;
          }
          
          // Skip pegs in home slots (can't be moved with numbered cards)
          const pegSpace = findSpaceForPeg(gameState, pegId);
          if (!pegSpace) {
            Log(`Skipping peg ${pegId} as it was not found on the board`);
            return false;
          }
          
          if (pegSpace.type === 'home') {
            Log(`Skipping peg ${pegId} as it's in a home space`);
            return false;
          }
          
          if (pegSpace.type === 'castle') {
            Log(`Skipping peg ${pegId} as it's in a castle space`);
            return false;
          }
          
          Log(`Peg ${pegId} is selectable for second move of 9 card (at space ${pegSpace.id})`);
          return true;
        });
        
        Log(`Found ${selectablePegs.length} possible pegs for 9 card second move (excluding first move peg and home/castle pegs)`);
        
        // Check if any of these pegs actually have valid moves
        let hasValidMoves = false;
        if (selectablePegs.length > 0) {
          // Get all possible moves for the second part of the 9 card
          const allPossibleMoves = getPossibleMoves(
            gameState,
            currentPlayer?.id,
            selectedCardId,
            {
              direction: secondMoveDirection,
              steps: nineCardState.remainingSteps,
              isSecondMove: true,
              firstMovePegId: nineCardState.firstMovePegId
            }
          );
          
          // Filter moves for selectable pegs only
          const validMoves = allPossibleMoves.filter(move => selectablePegs.includes(move.pegId));
          Log(`Found ${validMoves.length} valid moves for the second part of the 9 card split`);
          
          hasValidMoves = validMoves.length > 0;
        }
        
        // Calculate possible moves for each remaining peg to check if there are valid options
        if (selectablePegs.length === 0 || !hasValidMoves) {
          Log('No selectable pegs with valid moves for 9 card second move');
          setPromptMessage(`No valid moves available for the second part of your 9 card split.`);
          
          // Set a state to indicate no valid moves are available, so we can show a "Skip Second Move" button
          setNineCardState(prev => ({
            ...prev,
            state: 'NO_VALID_SECOND_MOVES',
            selectablePegsForSecondMove: []
          }));
        } else {
          // Set the selectable pegs and update UI state
          setSelectablePegIds(selectablePegs);
          setNineCardState(prev => ({
            ...prev,
            state: 'SECOND_MOVE_READY',
            selectablePegsForSecondMove: selectablePegs
          }));
          
          setPromptMessage(getNinePegSelectionPrompt(secondMoveDirection, nineCardState.remainingSteps));
        }
      }
      
      // Reset the flag after setup is complete
      setFirstMoveCompleted(false);
    }
  }, [firstMoveCompleted, sevenCardState, nineCardState, gameState, selectedCardId]);
  
  // Modify handleSevenCardFirstMove to use detailed logging
  const handleSevenCardFirstMove = (pegId: string) => {
    Log(`handleSevenCardFirstMove called for peg ${pegId}`);
    Log(`Current sevenCardState:`, sevenCardState);
    
    // Ensure we have required state
    if (!sevenCardState.firstMoveSteps || !selectedCardId) {
      Log('Missing required state for first move');
      return;
    }
    
    // Get the current player and their available moves
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    
    // Get possible moves for this peg
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer?.id, 
      selectedCardId, 
      { steps: sevenCardState.firstMoveSteps }
    );
    
    Log(`Found ${moves.length} possible moves for peg ${pegId} with ${sevenCardState.firstMoveSteps} steps`);
    
    // Find all moves for this peg so we can surface castle-entry choice when available.
    const pegMoves = moves.filter(m => m.pegId === pegId);

    if (pegMoves.length === 0) {
      Log(`No valid move available for peg ${pegId}`);
      setPromptMessage('No valid move available for the selected peg. Please choose another peg.');
      return;
    }

    const castleEntryMove = pegMoves.find(m => m.metadata?.castleEntry);
    const regularMove = pegMoves.find(m => !m.metadata?.castleEntry);

    if (castleEntryMove) {
      Log(`Castle entry move available for split seven first move on peg ${pegId}; prompting for choice`);
      setCastlePromptState({
        isActive: true,
        pegId,
        regularMove,
        castleMove: castleEntryMove
      });
      setPromptMessage("Would you like this peg to go into your castle?");
      return;
    }

    const move = regularMove ?? pegMoves[0];

    if (!move || move.destinations.length === 0) {
      Log(`No valid move destination available for peg ${pegId}`);
      setPromptMessage('No valid move available for the selected peg. Please choose another peg.');
      return;
    }
    
    Log(`Selected move destination: ${move.destinations[0]}`);
    const destination = move.destinations[0];
    
    // Make sure the metadata is properly set for a split move
    const moveWithMetadata = {
      ...move,
      metadata: {
        ...move.metadata,
        sevenCardMove: {
          steps: sevenCardState.firstMoveSteps,
          isFirstMove: true
        }
      }
    };
    
    Log(`Applying first move with metadata:`, moveWithMetadata.metadata);
    
    // Apply the first move
    const result = applyMove(gameState, moveWithMetadata);
    
    // Update game state with the new state after the move
    setGameState(result.newState);
    
    // Clear prompt message immediately
    setPromptMessage('');
    
    // Clear selectable pegs temporarily
    setSelectablePegIds([]);
    setSelectableSpaceIds([]);
    
    // Show bump message if there was one
    if (result.bumpMessage) {
      setBumpMessage(result.bumpMessage);
    }
    
    // Update state all at once to ensure consistency
    setSevenCardState(prev => {
      const updatedState = {
        ...prev,
        state: 'FIRST_MOVE_COMPLETE' as const,
        firstMovePegId: pegId,
        firstMoveDestination: destination,
        remainingSteps: 7 - (sevenCardState.firstMoveSteps || 0)
      };
      Log(`Updated sevenCardState after first move:`, updatedState);
      return updatedState;
    });
    
    // Trigger the second move setup
    Log('Setting firstMoveCompleted to true to trigger second move setup');
    setFirstMoveCompleted(true);
  };
  
  // Modify handleSevenCardSecondMove with detailed logging
  const handleSevenCardSecondMove = (pegId: string) => {
    Log(`handleSevenCardSecondMove called for peg ${pegId}`);
    Log(`Current sevenCardState:`, sevenCardState);
    
    // Ensure we have required state
    if (!sevenCardState.remainingSteps || !selectedCardId || !sevenCardState.firstMovePegId) {
      Log('Missing required state for second move');
      setPromptMessage('Unable to complete the move. Please try again or end your turn.');
      return;
    }
    
    // Find the selected card in the player's hand
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
    
    if (!selectedCard) {
      Log(`Selected card not found: ${selectedCardId}`);
      // Try to find a 7 card in the player's hand as a fallback
      const sevenCard = currentPlayer?.hand.find(c => c.rank === '7');
      if (sevenCard) {
        Log(`Found alternate 7 card: ${sevenCard.id}`);
        // Update selectedCardId to use this card
        setSelectedCardId(sevenCard.id);
      } else {
        setPromptMessage('Card not found. Please try again or end your turn.');
        return;
      }
    }
    
    // Check if this peg is selectable (should be any valid peg that wasn't used for first move)
    if (!selectablePegIds.includes(pegId) && 
        !(sevenCardState.selectablePegsForSecondMove || []).includes(pegId)) {
      Log(`Peg ${pegId} is not in the selectable pegs list:`, selectablePegIds);
      setPromptMessage('That peg cannot be moved for the second part of the split.');
      return;
    }
    
    // Ensure not trying to move the same peg twice
    if (pegId === sevenCardState.firstMovePegId) {
      Log(`Cannot move the same peg ${pegId} for second move`);
      setPromptMessage('You must choose a different peg for the second move.');
      return;
    }

    // Get possible moves for this peg using getPossibleMoves which uses our updated getSevenSplitMoves
    const moves = getPossibleMoves(
      gameState,
      currentPlayer?.id,
      selectedCardId,
      {
        steps: sevenCardState.remainingSteps,
        isSecondMove: true,
        firstMovePegId: sevenCardState.firstMovePegId
      }
    );

    Log(`Found ${moves.length} possible moves for peg ${pegId} with remaining steps ${sevenCardState.remainingSteps}`);

    // Filter moves for this peg
    const pegMoves = moves.filter(move => move.pegId === pegId);
    Log(`Found ${pegMoves.length} moves specifically for peg ${pegId}`);

    if (pegMoves.length === 0) {
      Log(`No valid moves found for peg ${pegId}`);
      
      // Provide a more detailed error message
      const pegSpace = findSpaceForPeg(gameState, pegId);
      Log(`Peg ${pegId} is at space ${pegSpace?.id} (type: ${pegSpace?.type}, section: ${pegSpace?.sectionIndex}, index: ${pegSpace?.index})`);
      
      // Check if this peg is before the castle entrance and could potentially enter the castle
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(currentPlayer.id)
      );
      
      // Check if peg is before castle entrance in player's section
      const isBeforeCastleEntrance = pegSpace && 
                                     pegSpace.sectionIndex === playerSection?.index && 
                                     pegSpace.index < 3 && 
                                     (pegSpace.type === 'normal' || pegSpace.type === 'entrance');
      
      if (isBeforeCastleEntrance && pegSpace) {
        // Calculate if the remaining steps could let the peg enter the castle
        const stepsToEntrance = 3 - pegSpace.index;
        const remainingStepsForCastle = (sevenCardState.remainingSteps || 0) - stepsToEntrance;
        
        if (remainingStepsForCastle > 0) {
          // Calculate potential castle index (0-based)
          const potentialCastleIndex = remainingStepsForCastle - 1;
          
          // Log this information
          Log(`Peg is before castle entrance. Steps to entrance: ${stepsToEntrance}, remaining castle steps: ${remainingStepsForCastle}`);
          Log(`Potential castle index: ${potentialCastleIndex}`);
          
          // Check if any castle spaces at this index already have the player's pegs
          const targetCastleSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection?.index && 
            s.type === 'castle' && 
            s.index === potentialCastleIndex
          );
          
          if (targetCastleSpace) {
            const hasCastlePeg = targetCastleSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === currentPlayer.id;
            });
            
            if (hasCastlePeg) {
              Log(`Castle space ${targetCastleSpace.id} already has a peg, cannot enter`);
              setPromptMessage(`No valid moves available for this peg. The target castle space already has one of your pegs.`);
            } else {
              // This is unusual - the peg should be able to enter the castle
              Log(`Unexpected: Castle entry should be possible but no move was generated`);
              
              // Try a different approach - create and apply a castle entry move directly
              setPromptMessage(`Attempting to create a castle entry move for this peg...`);
              
              // Create a castle entry move manually
              const castleEntryMove: Move = {
                playerId: currentPlayer.id,
                cardId: selectedCardId,
                pegId: pegId,
                from: pegSpace.id,
                destinations: [targetCastleSpace.id],
                metadata: {
                  castleEntry: true,
                  castleMovement: true,
                  willPassCastleEntrance: true,
                  sevenCardMove: {
                    steps: sevenCardState.remainingSteps || 0,
                    isFirstMove: false
                  }
                }
              };
              
              // Apply the move
              const { newState } = applyMove(gameState, castleEntryMove);
              setGameState(newState);
              
              // Reset UI state
              setSelectedCardId(null);
              setSelectedPegId(null);
              setSelectableSpaceIds([]);
              setSelectablePegIds([]);
              setPromptMessage(`Moved peg into castle slot ${potentialCastleIndex + 1}`);
              
              // Reset seven card state
              setSevenCardState({
                state: 'INITIAL',
                isSplit: false
              });
              
              return;
            }
          }
        } else {
          Log(`Not enough steps to enter castle: needs ${stepsToEntrance}, has ${sevenCardState.remainingSteps || 0}`);
          setPromptMessage(`No valid moves available for this peg. It needs ${stepsToEntrance} steps to reach the castle entrance, but you only have ${sevenCardState.remainingSteps || 0} steps left.`);
        }
      } else {
        // Check for nearby pegs in same section that might be blocking
        const nearbyPegs = Array.from(gameState.board.allSpaces.values())
          .filter(s => pegSpace && s.sectionIndex === pegSpace.sectionIndex && 
                  s.type === 'normal' && 
                  s.index > pegSpace.index && 
                  s.index <= pegSpace.index + (sevenCardState.remainingSteps || 0))
          .flatMap(s => s.pegs)
          .filter(p => p.startsWith(currentPlayer.id));
          
        if (nearbyPegs.length > 0) {
          Log(`Found ${nearbyPegs.length} nearby pegs that might be blocking: ${nearbyPegs.join(', ')}`);
          setPromptMessage(`No valid moves available for this peg. It appears the path is blocked by your own pegs. Please choose another peg or end your turn.`);
        } else {
          setPromptMessage('No valid moves available for this peg. Please choose another peg or end your turn.');
        }
      }
      return;
    }

    const regularMoves = pegMoves.filter(move => !move.metadata?.castleMovement);
    const castleMoves = pegMoves.filter(move => move.metadata?.castleMovement);
    Log(`Second split seven move options for peg ${pegId}: regular=${regularMoves.length}, castle=${castleMoves.length}`);

    if (regularMoves.length > 0 && castleMoves.length > 0) {
      setCastlePromptState({
        isActive: true,
        pegId,
        regularMove: regularMoves[0],
        castleMove: castleMoves[0]
      });
      setPromptMessage("Would you like this peg to go into your castle?");
      return;
    }

    // If there's only one valid move (for cases with no castle options)
    if (pegMoves.length === 1) {
      // Take the single available move
      const moveToApply = pegMoves[0];
      
      Log(`Applying automatic move with single destination: ${moveToApply.destinations[0]}`);
      const result = applyMove(gameState, moveToApply);
      
      if (!result.newState) {
        Log('Failed to apply the single move');
        setPromptMessage('Failed to apply the move. Please try again or end your turn.');
        return;
      }
      
      // Update game state
      setGameState(result.newState);
      
      // Show bump message if there was one
      if (result.bumpMessage) {
        Log(`Bump message: ${result.bumpMessage}`);
        setBumpMessage(result.bumpMessage);
      }
      
      // Reset all related state
      setSevenCardState({ state: 'INITIAL', isSplit: false });
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setPromptMessage('');
      
      // Check if game is over
      if (isGameOver(result.newState)) {
        setGameState({...result.newState, phase: 'gameOver'});
        return;
      }
      
      // End the player's turn
      handleEndTurn(result.newState);
      return;
    }

    // If there are multiple regular moves or choices
    setSelectedPegId(pegId);
    const destinations = pegMoves.flatMap(move => move.destinations);
    setSelectableSpaceIds(destinations);
    setPromptMessage("Select a destination space for this peg");
  };
  
  // Add new function to handle the first part of the 9 card move
  const handleNineCardFirstMove = (pegId: string) => {
    Log(`handleNineCardFirstMove called for peg ${pegId}`);
    Log(`Current nineCardState:`, nineCardState);
    
    // Ensure we have required state
    if (!nineCardState.steps || !nineCardState.direction || !selectedCardId) {
      Log('Missing required state for 9 card first move');
      return;
    }
    
    // Get the current player and their available moves
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    // Create a properly typed direction variable
    const direction: 'forward' | 'backward' = nineCardState.direction;
    Log(`First move direction: ${direction}`);
    
    // Get possible moves for this peg
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer.id, 
      selectedCardId, 
      { 
        direction,
        steps: nineCardState.steps 
      }
    );
    
    Log(`Found ${moves.length} possible moves for peg ${pegId} with direction ${direction} and steps ${nineCardState.steps}`);
    
    // Find the move for this peg
    const move = moves.find(m => m.pegId === pegId);
    
    // Check if we have a castle entry move for this peg
    const castleEntryMove = moves.find(m => m.pegId === pegId && m.metadata?.castleEntry);
    
    // If we have a castle entry move but no regular move, use the castle entry move
    if (!move && castleEntryMove) {
      Log(`No regular move found, but found a castle entry move for peg ${pegId}`);
      
      // Find the player's section - this is where their castle is
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(currentPlayer.id)
      );
      if (!playerSection) {
        Log(`Could not find section for player ${currentPlayer.id}`);
        return;
      }
      
      // Get the player's section index
      const sectionIndex = playerSection.index;
      
      // Find the peg's space
      const pegSpace = findSpaceForPeg(gameState, pegId);
      if (!pegSpace) {
        Log(`Could not find space for peg ${pegId}`);
        return;
      }
      
      Log(`Using player's section index ${sectionIndex} for castle entry (peg is in section ${pegSpace.sectionIndex})`);
      
      // Calculate castle steps using the cross-section logic
      let stepsToEntrance = 0;
      
      // If peg is in a different section than the player's castle
      if (pegSpace.sectionIndex !== sectionIndex) {
        // Cross-section movement is more complex
        const orderedSpaces = Array.from(gameState.board.allSpaces.values())
          .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
          .sort((a, b) => {
            if (a.sectionIndex !== b.sectionIndex) {
              return a.sectionIndex - b.sectionIndex;
            }
            return a.index - b.index;
          });
        
        // Find current space and castle entrance indices in the flattened space array
        const currentSpaceIndex = orderedSpaces.findIndex(s => s.id === pegSpace.id);
        const castleEntranceIndex = orderedSpaces.findIndex(s => 
          s.sectionIndex === sectionIndex && s.type === 'entrance' && s.index === 3
        );
        
        if (currentSpaceIndex !== -1 && castleEntranceIndex !== -1) {
          // For forward movement, castle entrance should be ahead of current position 
          // or wrap around the board
          if (castleEntranceIndex > currentSpaceIndex) {
            // Castle entrance is ahead in the same circuit
            stepsToEntrance = castleEntranceIndex - currentSpaceIndex;
          } else {
            // Castle entrance is behind, need to go all the way around
            stepsToEntrance = (orderedSpaces.length - currentSpaceIndex) + castleEntranceIndex;
          }
          
          Log(`Cross-section castle entry: ${stepsToEntrance} steps from ${pegSpace.id} to castle entrance`);
        }
      } else {
        // Same section logic
        stepsToEntrance = pegSpace.index < 3 ? 3 - pegSpace.index : 0;
      }
      
      // Then subtract from total steps (plus 1 for the entrance itself)
      const castleSteps = nineCardState.steps - stepsToEntrance - 1;
      
      Log(`Steps to castle entrance: ${stepsToEntrance}, Remaining castle steps: ${castleSteps}`);
      
      // Only proceed if castle steps is valid (0-4)
      if (castleSteps >= 0 && castleSteps <= 4) {
        // Find the appropriate castle space (0-based index)
        const castleIndex = castleSteps;
        
        // Find the castle destination space
        const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(
          space => space.sectionIndex === sectionIndex && space.type === 'castle' && space.index === castleIndex
        );
        
        if (castleDestinationSpace) {
          Log(`Found castle destination space at index ${castleIndex}: ${castleDestinationSpace.id}`);
          
          // Create a proper castle move
          const properCastleMove = {
            ...castleEntryMove,
            destinations: [castleDestinationSpace.id],
            metadata: {
              ...castleEntryMove.metadata,
              castleEntry: true,
              castleMovement: true
            }
          };
          
          // Set up prompt state for castle choice
          setCastlePromptState({
            isActive: true,
            pegId: pegId,
            castleMove: properCastleMove,
            regularMove: undefined // No regular move available
          });
          
          setPromptMessage('Do you want to enter the castle?');
          return;
        }
      }
    }
    
    if (move && move.destinations.length > 0) {
      const destination = move.destinations[0];
      Log(`Selected destination for first move: ${destination}`);
      
      // Apply the first move with our fixed direction and mark as multi-part move
      const moveWithMetadata = {
        ...move,
        metadata: {
          ...move.metadata,
          nineCardMove: {
            direction,
            steps: nineCardState.steps,
            isFirstMove: true,
            isFirstMoveOfMultiPartMove: true  // Add this flag to match the 7 card implementation
          }
        }
      };
      
      Log(`Applying first move with metadata:`, moveWithMetadata.metadata);
      
      // Check if this move passes or lands on a castle entrance and player has the option to enter
      if ((moveWithMetadata.metadata?.willPassCastleEntrance || moveWithMetadata.metadata?.willLandOnCastleEntrance) && 
          direction === 'forward') {
        Log('Move passes or lands on castle entrance. Prompting player for choice...');
        
        // Find the castle entrance space for this section
        const peg = currentPlayer.pegs.find(p => p === pegId);
        if (!peg) {
          Log(`Could not find peg ${pegId} for player ${currentPlayer.id}`);
          return;
        }
        
        // Find the peg's space
        const pegSpace = findSpaceForPeg(gameState, pegId);
        if (!pegSpace) {
          Log(`Could not find space for peg ${pegId}`);
          return;
        }
        
        // Find the player's section - this is where their castle is
        const playerSection = gameState.board.sections.find(section => 
          section.playerIds?.includes(currentPlayer.id)
        );
        if (!playerSection) {
          Log(`Could not find section for player ${currentPlayer.id}`);
          return;
        }
        
        // Get the player's section index
        const sectionIndex = playerSection.index;
        Log(`Using player's section index ${sectionIndex} for castle entry (peg is in section ${pegSpace.sectionIndex})`);
        
        // Find the castle entrance space for this section
        const castleEntranceSpace = Array.from(gameState.board.allSpaces.values()).find(
          space => space.sectionIndex === sectionIndex && space.type === 'entrance' && space.index === 3
        );
        
        if (!castleEntranceSpace) {
          Log(`Could not find castle entrance space for section ${sectionIndex}`);
          return;
        }
        
        // Calculate steps for castle movement
        // When a peg passes castle entrance, we need to calculate how many steps it would take after entering
        // First, calculate steps to reach the entrance
        let stepsToEntrance = 0;
        
        // If peg is in the same section as the player's castle
        if (pegSpace.sectionIndex === sectionIndex) {
          // If peg is before the castle entrance (in its own section)
          stepsToEntrance = pegSpace.index < 3 ? 3 - pegSpace.index : 0;
        } else {
          // Cross-section movement is more complex:
          // 1. Steps from current position to end of section
          // 2. Steps through any intermediate sections
          // 3. Steps from start of player's section to castle entrance (index 3)
          
          // Find all spaces in order by section and index
          const orderedSpaces = Array.from(gameState.board.allSpaces.values())
            .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
            .sort((a, b) => {
              if (a.sectionIndex !== b.sectionIndex) {
                return a.sectionIndex - b.sectionIndex;
              }
              return a.index - b.index;
            });
          
          // Find current space and castle entrance indices in the flattened space array
          const currentSpaceIndex = orderedSpaces.findIndex(s => s.id === pegSpace.id);
          const castleEntranceIndex = orderedSpaces.findIndex(s => 
            s.sectionIndex === sectionIndex && s.type === 'entrance' && s.index === 3
          );
          
          if (currentSpaceIndex !== -1 && castleEntranceIndex !== -1) {
            // For forward movement, castle entrance should be ahead of current position 
            // or wrap around the board
            if (castleEntranceIndex > currentSpaceIndex) {
              // Castle entrance is ahead in the same circuit
              stepsToEntrance = castleEntranceIndex - currentSpaceIndex;
            } else {
              // Castle entrance is behind, need to go all the way around
              stepsToEntrance = (orderedSpaces.length - currentSpaceIndex) + castleEntranceIndex;
            }
            
            Log(`Cross-section castle entry: ${stepsToEntrance} steps from ${pegSpace.id} to castle entrance`);
          }
        }
        
        // Then subtract from total steps (plus 1 for the entrance itself)
        const castleSteps = nineCardState.steps - stepsToEntrance - 1;
        
        Log(`Steps to castle entrance: ${stepsToEntrance}, Remaining castle steps: ${castleSteps}`);
        
        // Only allow castle entry if there are valid steps (0-4) remaining
        if (castleSteps < 0 || castleSteps > 4) {
          Log(`Castle steps ${castleSteps} is out of valid range (0-4), skipping castle entry option`);
          
          // Apply the regular move instead since castle entry is not valid
          const result = applyMove(gameState, moveWithMetadata);
          setGameState(result.newState);
          setPromptMessage('');
          setSelectablePegIds([]);
          setSelectableSpaceIds([]);
          
          if (result.bumpMessage) {
            setBumpMessage(result.bumpMessage);
          }
          
          // First move steps, calculate remaining steps for second move
          const firstMoveSteps = nineCardState.steps;
          const remainingSteps = 9 - firstMoveSteps;
          Log(`First move steps: ${firstMoveSteps}, calculated remaining steps: ${remainingSteps}, adjusted to: ${remainingSteps}`);
          
          // Setup for second move for split nine
          if (nineCardState.splitSelected) {
            Log(`Setting firstMoveCompleted to true to trigger second move setup`);
            setNineCardState({
              ...nineCardState,
              state: 'FIRST_MOVE_COMPLETE',
              firstMoveComplete: true,
              firstMovePegId: pegId,
              remainingSteps: remainingSteps
            });
          } else {
            // For regular nine, complete the turn
            Log(`Completing regular nine card move`);
            handleEndTurn(result.newState);
          }
          
          return;
        }
        
        // Find the appropriate castle space (0-based index)
        const castleIndex = Math.min(castleSteps, 4); // Castle has positions 0-4
        
        // Find the castle destination space
        const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(
          space => space.sectionIndex === sectionIndex && space.type === 'castle' && space.index === castleIndex
        );
        
        if (!castleDestinationSpace) {
          Log(`Could not find castle destination space at index ${castleIndex}`);
          return;
        }
        
        // Create a castle move
        const castleMove = {
          ...moveWithMetadata,
          destinations: [castleDestinationSpace.id],
          metadata: {
            ...moveWithMetadata.metadata,
            castleEntry: true,
            castleMovement: true
          }
        };
        
        Log(`Created castle move to ${castleDestinationSpace.id}`);
        
        // Set up prompt state for castle choice
        setCastlePromptState({
          isActive: true,
          pegId: pegId,
          castleMove: castleMove,
          regularMove: moveWithMetadata
        });
        
        setPromptMessage('Do you want to enter the castle?');
        return;
      }
      
      // Apply the move
      const result = applyMove(gameState, moveWithMetadata);
      
      // Update game state with the new state after the move
      setGameState(result.newState);
      
      // Clear prompt message immediately
      setPromptMessage('');
      
      // Clear selectable pegs temporarily
      setSelectablePegIds([]);
      setSelectableSpaceIds([]);
      
      // Show bump message if there was one
      if (result.bumpMessage) {
        setBumpMessage(result.bumpMessage);
      }
      
      // First move steps, calculate remaining steps for second move
      const firstMoveSteps = nineCardState.steps;
      const remainingSteps = 9 - firstMoveSteps;
      Log(`First move steps: ${firstMoveSteps}, calculated remaining steps: ${remainingSteps}, adjusted to: ${remainingSteps}`);
      
      // Update state all at once to ensure consistency
      setNineCardState({
        ...nineCardState,
        state: 'FIRST_MOVE_COMPLETE',
        firstMoveComplete: true,
        firstMovePegId: pegId,
        remainingSteps: remainingSteps
      });
      
      Log(`Setting firstMoveCompleted to true to trigger second move setup`);
      Log(`Updated nineCardState after first move:`, { 
        ...nineCardState, 
        state: 'FIRST_MOVE_COMPLETE', 
        firstMoveComplete: true,
        firstMovePegId: pegId,
        remainingSteps
      });
      
      // Setup for the second move
      handleFirstMoveComplete(pegId, remainingSteps);
    }
  };

  // Helper function to set up the second move of a 9 card split
  const handleFirstMoveComplete = (pegId: string, remainingSteps: number) => {
    Log('First move completed, setting up second move');
    Log('Setting up 9 card split second move');
    Log(`9 card state: ${JSON.stringify(nineCardState)}`);
    
    // Find the selected card in the player's hand
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const selectedCard = currentPlayer.hand.find(c => c.id === selectedCardId);
    
    if (!selectedCard) {
      Log(`Could not find selected card ${selectedCardId} in player's hand`);
      return;
    }
    
    Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
    
    // For the second move, we use the opposite direction
    const secondMoveDirection: 'forward' | 'backward' = 
      nineCardState.direction === 'forward' ? 'backward' : 'forward';
    
    Log(`First move direction: ${nineCardState.direction}, second move direction: ${secondMoveDirection}`);
    
    // For 9 card, enforce that total steps must equal 9
    const firstMoveSteps = nineCardState.steps || 0;
    const secondMoveSteps = 9 - firstMoveSteps;
    const firstMovePegId = pegId;
    
    Log(`First move used ${firstMoveSteps} steps, second move will use ${secondMoveSteps} steps (total: 9)`);
    
    // Find selectable pegs for the second move (all pegs EXCEPT the one used in the first move)
    const selectablePegs = currentPlayer.pegs.filter(candidatePegId => {
      // Skip the peg used in the first move
      if (candidatePegId === firstMovePegId) {
        Log(`Skipping peg ${candidatePegId} as it was used for first move`);
        return false;
      }
      
      // Skip pegs that are in castle spaces
      const pegSpace = findSpaceForPeg(gameState, candidatePegId);
      if (pegSpace?.type === 'castle') {
        Log(`Skipping peg ${candidatePegId} as it's in a castle space`);
        return false;
      }
      
      // Skip pegs that are in home spaces
      if (pegSpace?.type === 'home') {
        Log(`Skipping peg ${candidatePegId} as it's in a home space`);
        return false;
      }
      
      // This peg is selectable
      Log(`Peg ${candidatePegId} is selectable for second move of 9 card (at space ${pegSpace?.id})`);
      return true;
    });
    
    Log(`Found ${selectablePegs.length} possible pegs for 9 card second move (excluding first move peg and home/castle pegs)`);
    
    // Check which pegs actually have valid moves
    const selectablePegsWithMoves: string[] = [];
    selectablePegs.forEach(candidatePegId => {
      const moves = getPossibleMoves(
        gameState, 
        currentPlayer.id, 
        selectedCardId || '', 
        {
          direction: secondMoveDirection,
          steps: secondMoveSteps, // Use secondMoveSteps here instead of remainingSteps
          isSecondMove: true,
          firstMovePegId: firstMovePegId
        }
      );
      
      const candidatePegHasMove = moves.some(move => move.pegId === candidatePegId);
      if (candidatePegHasMove) {
        selectablePegsWithMoves.push(candidatePegId);
      }
    });
    
    if (selectablePegsWithMoves.length === 0) {
      Log('No valid moves for any peg in second part of 9 card split');
      setSelectablePegIds([]);
      setNineCardState(prev => ({
        ...prev,
        state: 'NO_VALID_SECOND_MOVES',
        firstMovePegId: firstMovePegId,
        firstMoveComplete: true,
        remainingSteps: secondMoveSteps
      }));
      setPromptMessage('No valid moves available for the second part of your 9 card split.');
      return;
    }
    
    // Set the selectable pegs for the second move
    setSelectablePegIds(selectablePegsWithMoves);
    setNineCardState(prev => ({
      ...prev,
      state: 'SECOND_MOVE_READY',
      firstMovePegId: firstMovePegId,
      firstMoveComplete: true,
      remainingSteps: secondMoveSteps // Store the correct secondMoveSteps value
    }));
    
    setPromptMessage(getNinePegSelectionPrompt(secondMoveDirection, secondMoveSteps));
  };

  // Add a new function to handle the second part of the 9 card move
  const handleNineCardSecondMove = (pegId: string) => {
    Log(`handleNineCardSecondMove called for peg ${pegId}`);
    Log(`Current nineCardState:`, nineCardState);
    
    // Ensure we have required state
    if (!nineCardState.remainingSteps || !selectedCardId || !nineCardState.firstMovePegId || !nineCardState.direction) {
      Log('Missing required state for 9 card second move');
      setPromptMessage('Unable to complete the move. Please try again or end your turn.');
      return;
    }
    
    // Find the selected card in the player's hand
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
    
    if (!selectedCard) {
      Log(`Selected card not found: ${selectedCardId}`);
      // Try to find a 9 card in the player's hand as a fallback
      const nineCard = currentPlayer?.hand.find(c => c.rank === '9');
      if (nineCard) {
        Log(`Found alternate 9 card: ${nineCard.id}`);
        // Update selectedCardId to use this card
        setSelectedCardId(nineCard.id);
      } else {
        Log(`No 9 card found in player's hand. Unable to complete move.`);
        setPromptMessage('Card not found. Please try again or end your turn.');
        return;
      }
    } else {
      Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
    }
    
    // Ensure this peg is actually selectable
    if (!selectablePegIds.includes(pegId) && 
        !(nineCardState.selectablePegsForSecondMove || []).includes(pegId)) {
      Log(`Peg ${pegId} is not in the selectable pegs list:`, selectablePegIds);
      setPromptMessage('That peg cannot be moved for the second part of the 9 card.');
      return;
    }
    
    // Ensure not trying to move the same peg twice
    if (pegId === nineCardState.firstMovePegId) {
      Log(`Cannot move the same peg ${pegId} for second move`);
      setPromptMessage('You must choose a different peg for the second move.');
      return;
    }
    
    // Get possible moves for this peg and remaining steps
    Log(`Getting possible moves for peg ${pegId} for second part of 9 card split`);
    
    // For the second move of a 9 card, use the opposite direction
    const secondMoveDirection: 'forward' | 'backward' = nineCardState.direction === 'forward' ? 'backward' : 'forward';
    Log(`First move direction: ${nineCardState.direction}, second move direction: ${secondMoveDirection}`);
    
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer?.id, 
      selectedCardId, 
      { 
        direction: secondMoveDirection,
        steps: nineCardState.remainingSteps,
        isSecondMove: true,
        firstMovePegId: nineCardState.firstMovePegId
      }
    );
    
    Log(`Found ${moves.length} possible moves for peg ${pegId} with direction ${secondMoveDirection} and steps ${nineCardState.remainingSteps}`);
    
    // Find moves for this peg
    const pegMoves = moves.filter(m => m.pegId === pegId);
    
    if (pegMoves.length === 0) {
      Log(`No move found for peg ${pegId}`);
      setPromptMessage('No valid move available for the selected peg. Please choose another peg or end your turn.');
      return;
    }
    
    // Check if there are any castle entry moves
    const regularMoves = pegMoves.filter(move => !move.metadata?.castleMovement);
    const castleMoves = pegMoves.filter(move => move.metadata?.castleMovement);
    
    Log(`Peg ${pegId} has ${regularMoves.length} regular moves and ${castleMoves.length} castle moves`);
    
    // ALWAYS prompt for castle entry if there are castle moves available
    // This is a key change to ensure castle entry is never automatic
    if (castleMoves.length > 0) {
      // Check if the peg is already in a castle
      const pegSpace = findSpaceForPeg(gameState, pegId);
      const isAlreadyInCastle = pegSpace && pegSpace.type === 'castle';
      
      Log(`Peg ${pegId} is at space ${pegSpace?.id}, isAlreadyInCastle: ${isAlreadyInCastle}`);
      
      // If peg is already in castle, don't prompt for castle entry - just apply the move
      if (isAlreadyInCastle) {
        Log(`Peg ${pegId} is already in castle - applying castle move without prompt`);
        const move = castleMoves[0];
        
        const { newState, bumpMessage } = applyMove(gameState, move);
        setGameState(newState);
        setBumpMessage(bumpMessage);
        setSelectableSpaceIds([]);
        setPromptMessage("Move applied!");
        handleEndTurn(newState);
        return;
      }
      
      // Only show prompt if peg is not already in castle
      Log(`Castle moves available, prompting player about castle entry for peg ${pegId}`);
      
      // Store the moves and activate the castle prompt
      setCastlePromptState({
        isActive: true,
        pegId,
        regularMove: regularMoves.length > 0 ? regularMoves[0] : undefined,
        castleMove: castleMoves[0]
      });
      
      // Display a prompt to the player
      setPromptMessage("Would you like this peg to go into your castle?");
      return;
    } 
    
    // If we only have a single move (either regular or castle), apply it
    if (pegMoves.length === 1) {
      const move = pegMoves[0];
      
      if (move.destinations.length === 0) {
        Log(`Move has no destinations for peg ${pegId}`);
        setPromptMessage('No valid destination for the selected peg. Please choose another peg or end your turn.');
        return;
      }
      
      const destination = move.destinations[0];
      Log(`Selected destination for second move: ${destination}`);
      
      // Apply the move with metadata
      const moveWithMetadata = {
        ...move,
        metadata: {
          ...move.metadata,
          nineCardMove: {
            direction: secondMoveDirection,
            steps: nineCardState.remainingSteps,
            isFirstMove: false
          }
        }
      };
      
      Log(`Applying second move with metadata:`, moveWithMetadata.metadata);
      
      // Apply the move and handle the result
      const result = applyMove(gameState, moveWithMetadata);
      
      // Update game state
      setGameState(result.newState);
      
      // Show bump message if there was one
      if (result.bumpMessage) {
        Log(`Bump message: ${result.bumpMessage}`);
        setBumpMessage(result.bumpMessage);
      }
      
      // Reset selection state
      setSelectedPegId(null);
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setPromptMessage('');
      
      // Reset nine card state
      setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
      
      // End the player's turn
      Log('Completing 9 card split move and ending turn');
      handleEndTurn(result.newState);
      return;
    }
    
    // Multiple destinations, let the player select the destination
    setSelectedPegId(pegId);
    const possibleDestinations = pegMoves.flatMap(move => move.destinations);
    setSelectableSpaceIds(possibleDestinations);
    setPromptMessage("Select a destination space for this peg");
  };
  
  // Add this function to handle castle choice
  const handleCastleChoice = (enterCastle: boolean) => {
    Log(`Castle choice made: ${enterCastle ? 'Enter Castle' : 'Continue on Board'}`);
    
    // Choose the appropriate move based on player's choice
    const moveToApply = enterCastle ? castlePromptState.castleMove : castlePromptState.regularMove;
    
    if (!moveToApply) {
      Log('Error: No move available for the chosen option');
      
      // If they chose not to enter the castle but there's no regular move available,
      // show a message explaining why and reset the prompt
      if (!enterCastle) {
        Log('Regular move is not available - likely blocked by another peg');
        setPromptMessage('Cannot make a regular move - the path is blocked by another peg.');
        
        // Keep the castle prompt active so they can choose to enter the castle
        setTimeout(() => {
          setPromptMessage("Would you like this peg to go into your castle?");
        }, 2000);
        
        return;
      }
      
      setCastlePromptState({ isActive: false, pegId: '' });
      return;
    }
    
    // Apply the chosen move
    const { newState, bumpMessage } = applyMove(gameState, moveToApply);
    setGameState(newState);
    setBumpMessage(bumpMessage);
    
    // Reset states
    setSelectableSpaceIds([]);
    setPromptMessage("Move applied!");
    setCastlePromptState({ isActive: false, pegId: '' });
    
    // Check if we're in the middle of a 7 card split first move.
    if (sevenCardState.isSplit && sevenCardState.state === 'STEPS_CHOSEN' && sevenCardState.firstMoveSteps) {
      Log('Castle choice was part of a 7 card split first move, setting up second move');
      const destination = moveToApply.destinations[0];

      setSevenCardState(prev => ({
        ...prev,
        state: 'FIRST_MOVE_COMPLETE',
        firstMovePegId: castlePromptState.pegId,
        firstMoveDestination: destination,
        remainingSteps: 7 - (prev.firstMoveSteps || 0)
      }));
      setPromptMessage('');
      setFirstMoveCompleted(true);
      return;
    }

    // Check if we're in the middle of a 9 card split move.
    if (nineCardState.state === 'STEPS_CHOSEN' && nineCardState.splitSelected && !nineCardState.firstMoveComplete) {
      Log('Castle move was part of a 9 card split first move, setting up second move');
      
      // Update nine card state to indicate first move is complete
      setNineCardState(prev => ({
        ...prev,
        state: 'FIRST_MOVE_COMPLETE',
        firstMoveComplete: true,
        firstMovePegId: castlePromptState.pegId,
        remainingSteps: nineCardState.steps
      }));
      
      // Set up second move
      handleFirstMoveComplete(castlePromptState.pegId, nineCardState.steps || 0);
    } else {
      // End the player's turn if not part of a split move
      handleEndTurn(newState);
    }
  };
  
  // Modify handlePegSelect with castle entrance checking
  const handlePegSelect = (pegId: string) => {
    // If in multiplayer mode and not current player's turn, do nothing
    if (isMultiplayer && !isCurrentPlayerTurn) {
      return;
    }
    
    // Special handling for dev mode - move pegs feature
    if (devMode && movePegsMode) {
      // In move pegs mode, we allow selecting any peg from any player
      Log(`Dev mode - move pegs: Selected peg ${pegId}`);
      setSelectedPegId(pegId);
      
      // Make all spaces selectable, except those already containing a peg
      const allValidSpaces = Array.from(gameState.board.allSpaces.values())
        .filter(space => {
          // A space is valid if it's not fully occupied
          // We still need to prevent moving to completely full spaces
          const isFullHome = space.type === 'home' && space.pegs.length >= 4;
          const isFullCastle = space.type === 'castle' && space.pegs.length >= 1;
          return !isFullHome && !isFullCastle;
        })
        .map(space => space.id);
      
      setSelectableSpaceIds(allValidSpaces);
      setPromptMessage('Click on any highlighted space to move the selected peg.');
      return;
    }
  
    // If no card is selected, early return
    if (!selectedCardId) {
      Log(`Peg selected without a card: ${pegId}`);
      return;
    }
    
    const selectedCard = gameState?.players[gameState?.currentPlayerIndex]?.hand.find(card => card.id === selectedCardId);
    if (!selectedCard) {
      Log(`Selected card not found: ${selectedCardId}`);
      return;
    }
    
    Log(`handlePegSelect: peg=${pegId}, card=${selectedCard.rank}, sevenCardState=${sevenCardState.state}, nineCardState=${nineCardState.state}`);
    
    // In 7 card split, handle differently based on state
    if (selectedCard.rank === '7' && sevenCardState.isSplit) {
      Log(`7 card split handling: state=${sevenCardState.state}`);
      
      // First part of the move
      if (sevenCardState.state === 'STEPS_CHOSEN') {
        Log(`Handling first move of 7 card split`);
        handleSevenCardFirstMove(pegId);
        return;
      } 
      // Second part of the move
      else if (sevenCardState.state === 'SECOND_MOVE_READY' || sevenCardState.state === 'FIRST_MOVE_COMPLETE') {
        Log(`Handling second move of 7 card split`);
        
        // Check if peg is in either current selectablePegIds or stored selectablePegs
        const isSelectable = selectablePegIds.includes(pegId) || 
                          (sevenCardState.selectablePegsForSecondMove || []).includes(pegId);
        
        Log(`Peg ${pegId} selectable? ${isSelectable}`);
        Log(`selectablePegIds:`, selectablePegIds);
        Log(`sevenCardState.selectablePegsForSecondMove:`, sevenCardState.selectablePegsForSecondMove);
        
        if (!isSelectable) {
          setPromptMessage('That peg cannot be moved for the second part of the split.');
          return;
        }

        if (pegId === sevenCardState.firstMovePegId) {
          setPromptMessage('You must choose a different peg for the second move.');
          return;
        }

        handleSevenCardSecondMove(pegId);
        return;
      }
    }
    // Regular 7 card (non-split) move
    else if (selectedCard.rank === '7' && !sevenCardState.isSplit) {
      Log(`Handling regular 7 card move (non-split)`);
      
      // For non-split 7 card, use the regular move logic
      setSelectedPegId(pegId);
      
      const moves = getPossibleMoves(gameState, gameState?.players[gameState?.currentPlayerIndex]?.id, selectedCardId);
      const possibleDestinations = moves
        .filter(move => move.pegId === pegId)
        .flatMap(move => move.destinations);
      
      Log(`Found ${possibleDestinations.length} possible destinations for regular 7 card move`);
      
      if (possibleDestinations.length === 0) {
        setPromptMessage("No valid moves for this peg with the selected card");
        setSelectedCardId('');
        return;
      }
      
      if (possibleDestinations.length === 1) {
        const move = {
          playerId: gameState?.players[gameState?.currentPlayerIndex]?.id,
          cardId: selectedCardId,
          pegId: pegId,
          from: '',
          destinations: possibleDestinations
        };
        
        Log(`Applying automatic move with single destination: ${possibleDestinations[0]}`);
        const { newState, bumpMessage } = applyMove(gameState, move);
        setGameState(newState);
        setBumpMessage(bumpMessage);
        setSelectableSpaceIds([]);
        setPromptMessage("Move applied!");
        handleEndTurn(newState);
      } else {
        setSelectableSpaceIds(possibleDestinations);
        setPromptMessage("Click on a highlighted space to move your peg");
      }
      return;
    }
    // Handle 9 card special case for first move
    else if (selectedCard.rank === '9' && nineCardState.state === 'STEPS_CHOSEN') {
      Log(`Handling first move of 9 card with steps=${nineCardState.steps}`);
      
      // For regular 9 card move with no split
      if (nineCardState.steps === 9 && !nineCardState.firstMoveComplete) {
        Log('Handling regular (non-split) 9 card move');
        
        // For non-split 9 card, use the regular move logic
        setSelectedPegId(pegId);
        
        const moves = getPossibleMoves(
          gameState, 
          gameState?.players[gameState?.currentPlayerIndex]?.id, 
          selectedCardId,
          {
            direction: 'forward',
            steps: 9
          }
        );
        
        // Find the specific moves for this peg
        const pegMoves = moves.filter(move => move.pegId === pegId);
        Log(`Found ${pegMoves.length} possible moves for peg ${pegId} with regular 9 card move`);
        
        if (pegMoves.length === 0) {
          setPromptMessage("No valid moves for this peg with the selected card");
          return;
        }
        
        if (pegMoves.length === 1) {
          const move = pegMoves[0];
          
          // Apply the move
          Log(`Applying automatic move with single destination: ${move.destinations[0]}`);
          const { newState, bumpMessage } = applyMove(gameState, move);
          setGameState(newState);
          setBumpMessage(bumpMessage);
          setSelectableSpaceIds([]);
          setPromptMessage("Move applied!");
          
          // Reset selection state
          setSelectedPegId(null);
          setSelectedCardId('');
          setSelectableSpaceIds([]);
          setSelectablePegIds([]);
          setPromptMessage('');
          
          // Reset nine card state
          setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
          
          // End turn
          handleEndTurn(newState);
          return;
        } else {
          // Multiple destinations, let the player select where to go
          const possibleDestinations = pegMoves.flatMap(move => move.destinations);
          setSelectableSpaceIds(possibleDestinations);
          setPromptMessage("Click on a highlighted space to move your peg");
          return;
        }
      }
      
      // Otherwise, handle the first move of a split 9 card
      handleNineCardFirstMove(pegId);
      return;
    }
    // Handle 9 card second move
    else if (selectedCard.rank === '9' && (nineCardState.state === 'SECOND_MOVE_READY' || nineCardState.state === 'FIRST_MOVE_COMPLETE') && nineCardState.firstMoveComplete) {
      Log(`Handling second move of 9 card split`);
      
      // Check if peg is in either current selectablePegIds or stored selectablePegs
      const isSelectable = selectablePegIds.includes(pegId) || 
                         (nineCardState.selectablePegsForSecondMove || []).includes(pegId);
      
      Log(`Peg ${pegId} selectable? ${isSelectable}`);
      Log(`selectablePegIds:`, selectablePegIds);
      Log(`nineCardState.selectablePegsForSecondMove:`, nineCardState.selectablePegsForSecondMove);
      
      if (!isSelectable) {
        setPromptMessage('That peg cannot be moved for the second part of the split.');
        return;
      }

      if (pegId === nineCardState.firstMovePegId) {
        setPromptMessage('You must choose a different peg for the second move.');
        return;
      }

      handleNineCardSecondMove(pegId);
      return;
    }
    // Regular move for all other cards (including King, Queen, Jack, etc)
    else {
      Log(`Handling regular move for ${selectedCard.rank} card`);
      setSelectedPegId(pegId);
      
      const moves = getPossibleMoves(gameState, gameState?.players[gameState?.currentPlayerIndex]?.id, selectedCardId);
      
      // Filter moves for the selected peg
      const pegMoves = moves.filter(move => move.pegId === pegId);
      
      // Check if any of these moves would pass the castle entrance
      const willPassCastleEntrance = pegMoves.some(move => move.metadata?.willPassCastleEntrance);
      
      // Check if any of these moves would land exactly on the castle entrance
      const willLandOnCastleEntrance = pegMoves.some(move => move.metadata?.willLandOnCastleEntrance);
      
      // Group moves by regular vs castle entry
      const regularMoves = pegMoves.filter(move => !move.metadata?.castleMovement);
      const castleMoves = pegMoves.filter(move => move.metadata?.castleMovement);
      
      Log(`Found ${pegMoves.length} possible moves for ${selectedCard.rank} card move`);
      Log(`Regular moves: ${regularMoves.length}, Castle moves: ${castleMoves.length}`);
      Log(`Will pass castle entrance? ${willPassCastleEntrance}`);
      Log(`Will land on castle entrance? ${willLandOnCastleEntrance}`);
      
      if (pegMoves.length === 0) {
        setPromptMessage("No valid moves for this peg with the selected card");
        setSelectedCardId(null);
        return;
      }
      
      // ALWAYS prompt for castle entry if there are castle moves available
      // This is a key change to ensure castle entry is never automatic
      if (castleMoves.length > 0) {
        // Check if the peg is already in a castle
        const pegSpace = findSpaceForPeg(gameState, pegId);
        const isAlreadyInCastle = pegSpace && pegSpace.type === 'castle';
        
        Log(`Peg ${pegId} is at space ${pegSpace?.id}, isAlreadyInCastle: ${isAlreadyInCastle}`);
        
        // If peg is already in castle, don't prompt for castle entry - just apply the move
        if (isAlreadyInCastle) {
          Log(`Peg ${pegId} is already in castle - applying castle move without prompt`);
          const move = castleMoves[0];
          
          const { newState, bumpMessage } = applyMove(gameState, move);
          setGameState(newState);
          setBumpMessage(bumpMessage);
          setSelectableSpaceIds([]);
          setPromptMessage("Move applied!");
          handleEndTurn(newState);
          return;
        }
        
        // Only show prompt if peg is not already in castle
        Log(`Castle moves available, prompting player about castle entry for peg ${pegId}`);
        
        // Store the moves and activate the castle prompt
        setCastlePromptState({
          isActive: true,
          pegId,
          regularMove: regularMoves.length > 0 ? regularMoves[0] : undefined,
          castleMove: castleMoves[0]
        });
        
        // Display a prompt to the player
        setPromptMessage("Would you like this peg to go into your castle?");
        return;
      }
      
      // If peg will land exactly on castle entrance, treat it as a regular move
      if (willLandOnCastleEntrance && !willPassCastleEntrance) {
        Log(`Peg will land exactly on castle entrance - treating as a regular move`);
        
        if (regularMoves.length === 1) {
          const move = regularMoves[0];
          
          Log(`Applying automatic move to castle entrance: ${move.destinations[0]}`);
          const { newState, bumpMessage } = applyMove(gameState, move);
          setGameState(newState);
          setBumpMessage(bumpMessage);
          setSelectableSpaceIds([]);
          setPromptMessage("Move applied!");
          handleEndTurn(newState);
          return;
        }
      }
      
      // For single destination moves with no castle choice
      if (pegMoves.length === 1) {
        const move = pegMoves[0];
        
        Log(`Applying automatic move with single destination: ${move.destinations[0]}`);
        const { newState, bumpMessage } = applyMove(gameState, move);
        setGameState(newState);
        setBumpMessage(bumpMessage);
        setSelectableSpaceIds([]);
        setPromptMessage("Move applied!");
        handleEndTurn(newState);
      } else {
        // For multiple destination options
        const possibleDestinations = pegMoves.flatMap(move => move.destinations);
        setSelectableSpaceIds(possibleDestinations);
        setPromptMessage("Click on a highlighted space to move your peg");
      }
    }
  };
  
  // Handle space selection for peg movement
  const handleSpaceSelect = (spaceId: string) => {
    // If in multiplayer mode and not current player's turn, do nothing
    if (isMultiplayer && !isCurrentPlayerTurn) {
      return;
    }
    
    logDebug(`Space clicked: ${spaceId}, Selected Peg: ${selectedPegId}, Is selectable: ${selectableSpaceIds.includes(spaceId)}`);
    
    // Special handling for dev mode - move pegs feature
    if (devMode && movePegsMode && selectedPegId && selectableSpaceIds.includes(spaceId)) {
      Log(`Dev mode - move pegs: Moving peg ${selectedPegId} to space ${spaceId}`);
      
      // Create a new game state with the peg moved
      const newState = { ...gameState };
      
      // Find the current space where the peg is located
      let currentSpace: BoardSpace | undefined;
      for (const space of Array.from(newState.board.allSpaces.values())) {
        if (space.pegs.includes(selectedPegId)) {
          currentSpace = space;
          break;
        }
      }
      
      // If we found the current space, remove the peg from it
      if (currentSpace) {
        currentSpace.pegs = currentSpace.pegs.filter(id => id !== selectedPegId);
      }
      
      // Add the peg to the new space
      const destinationSpace = newState.board.allSpaces.get(spaceId);
      if (destinationSpace) {
        destinationSpace.pegs.push(selectedPegId);
      }
      
      // Update the game state
      setGameState(newState);
      
      // Reset selection state
      setSelectedPegId(null);
      setSelectableSpaceIds([]);
      setPromptMessage('Peg moved successfully. Dev mode - move pegs is still active.');
      return;
    }
    
    if (selectedPegId && selectableSpaceIds.includes(spaceId)) {
      logDebug(`Selected space: ${spaceId}`);
      
      // Get the board space and check if it contains opponent pegs (for joker card)
      const space = gameState?.board.allSpaces.get(spaceId);
      const selectedCard = gameState?.players[gameState?.currentPlayerIndex]?.hand.find(card => card.id === selectedCardId);
      
      if (selectedCard) {
        logDebug(`Card: ${selectedCard.rank} of ${selectedCard.suit}`);
      } else {
        logDebug(`No card selected`);
      }
      
      if (space) {
        logDebug(`Space has ${space.pegs.length} pegs: ${space.pegs.join(', ')}`);
      } else {
        logDebug(`Space not found`);
      }
      
      if (selectedCard?.rank === 'joker' && space) {
        logDebug(`Joker card: clicked on space ${spaceId} with pegs: ${space.pegs.join(', ')}`);
        
        // Build the move
        const moves = getPossibleMoves(gameState, gameState?.players[gameState?.currentPlayerIndex]?.id, selectedCardId || '');
        logDebug(`Found ${moves.length} possible moves for player`);
        
        // Log all possible joker moves for debugging
        moves.forEach((move, idx) => {
          logDebug(`Move ${idx + 1}: Peg ${move.pegId} to ${move.destinations.join(', ')} with metadata: ${JSON.stringify(move.metadata || {})}`);
        });
        
        const jokerMove = moves.find(move => 
          move.pegId === selectedPegId && 
          move.destinations.includes(spaceId)
        );
        
        if (jokerMove) {
          logDebug(`Found joker move: ${JSON.stringify(jokerMove)}`);
          // Apply the joker move
          const { newState, bumpMessage } = applyMove(gameState, jokerMove);
          if (bumpMessage) {
            logDebug(`Bump message: ${bumpMessage}`);
          }
          
          setGameState(newState);
          setBumpMessage(bumpMessage);
          
          // Reset selection state
          setSelectedPegId(null);
          setSelectedCardId('');
          setSelectableSpaceIds([]);
          setSelectablePegIds([]);
          setPromptMessage('');
          
          // Check if game is over after move
          if (isGameOver(newState)) {
            setGameState({
              ...newState,
              phase: 'gameOver'
            });
            return;
          }
          
          // End the player's turn
          handleEndTurn(newState);
          return;
        } else {
          logDebug(`Error: Couldn't find the joker move in possible moves for peg ${selectedPegId} to space ${spaceId}`);
        }
      }
      
      // Regular move handling...
      const move = {
        playerId: gameState?.players[gameState?.currentPlayerIndex]?.id,
        cardId: selectedCardId || '', // Ensure non-null value
        pegId: selectedPegId,
        from: '',
        destinations: [spaceId]
      };
      
      // Apply the move
      logDebug("Applying move");
      const { newState, bumpMessage } = applyMove(gameState, move);
      
      if (bumpMessage) {
        logDebug(`Bump occurred: ${bumpMessage}`);
      }
      
      setGameState(newState);
      setBumpMessage(bumpMessage);
      
      // Reset selection state
      setSelectedPegId(null);
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setPromptMessage('');
      
      // Check if game is over after move
      if (isGameOver(newState)) {
        setGameState({
          ...newState,
          phase: 'gameOver'
        });
        return;
      }
      
      // End the player's turn
      handleEndTurn(newState);
    } else {
      logDebug(`Invalid space selection: ${spaceId} - either no peg selected or space not selectable`);
    }
  };

  handlePegSelectRef.current = handlePegSelect;
  handleSpaceSelectRef.current = handleSpaceSelect;
  
  // Handle end turn
  const handleEndTurn = (
    currentState: GameState = gameState,
    actionType: 'play_move' | 'discard_hand' | 'skip_second_move' = 'play_move'
  ) => {
    // Check if the game is over
    if (isGameOver(currentState)) {
      setPromptMessage("Game Over!");
      return;
    }

    // If in preserve play mode, reset the turn state but don't advance to next player
    let nextState;
    if (devMode && preservePlayMode) {
      nextState = { ...currentState };
    } else {
      nextState = advanceToNextPlayer(currentState);
    }
    
    // Hide cards when a new turn begins (for pass-and-play feature)
    if (!isMultiplayer) {
      setShowCards(false);
    }
    
    if (isMultiplayer && onMove) {
      // Optimistically update local UI, then hand the canonical commit to the multiplayer layer.
      setGameState(nextState);
      onMove({
        type: actionType,
        nextGameState: nextState
      });
    } else {
      updateGameState(nextState);
    }
    setSelectedCardId(null);
    setSelectedPegId(null);
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    setPromptMessage('');
    setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
    setSevenCardState({ state: 'INITIAL', isSplit: false });
    // Clear bump message after a delay
    setTimeout(() => setBumpMessage(undefined), 3000);
  };

  // Add this function to handle discarding and redrawing
  const handleDiscardAndRedraw = () => {
    const newState = { ...gameState };
    const player = newState.players[newState.currentPlayerIndex];
    
    // Add current hand to discard pile
    newState.discardPile.push(...player.hand);
    player.hand = [];
    
    // Draw 5 new cards
    for (let i = 0; i < 5; i++) {
      if (newState.drawPile.length > 0) {
        player.hand.push(newState.drawPile.pop()!);
      } else if (newState.discardPile.length > 0) {
        // If draw pile is empty, shuffle discard pile and use it
        newState.drawPile = [...newState.discardPile].sort(() => Math.random() - 0.5);
        newState.discardPile = [];
        if (newState.drawPile.length > 0) {
          player.hand.push(newState.drawPile.pop()!);
        }
      }
    }
    
    // Update game state
    updateGameState(newState);
    
    // Advance to next player
    handleEndTurn(newState, 'discard_hand');
  };
  
  // Function to shuffle the current player's hand (dev mode)
  const handleShuffleHand = () => {
    const newState = { ...gameState };
    const player = newState.players[newState.currentPlayerIndex];
    
    // Add current hand to discard pile
    newState.discardPile.push(...player.hand);
    player.hand = [];
    
    // Draw 5 new cards
    for (let i = 0; i < 5; i++) {
      if (newState.drawPile.length > 0) {
        player.hand.push(newState.drawPile.pop()!);
      } else if (newState.discardPile.length > 0) {
        // If draw pile is empty, shuffle discard pile and use it
        newState.drawPile = [...newState.discardPile].sort(() => Math.random() - 0.5);
        newState.discardPile = [];
        if (newState.drawPile.length > 0) {
          player.hand.push(newState.drawPile.pop()!);
        }
      }
    }
    
    setGameState(newState);
    setSelectedCardId(null);
  };
  
  // Render welcome/shuffle phase
  const renderWelcomePhase = () => {
    return (
      <div className="welcome-overlay">
        {/* Animated background elements */}
        {floatingElements.map(element => (
          <div
            key={element.id}
            className={`floating-element ${element.type}`}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
              backgroundColor: element.type === 'peg' ? element.color : undefined
            }}
          />
        ))}
        
        <div className="welcome-modal">
          <h1>Welcome to Joker Pursuit!</h1>
          <p>Start by shuffling the cards to begin the game.</p>
          
          {isShuffling ? (
            <div className="shuffle-animation-container shuffling">
              <div className="card-deck"></div>
              <div className="shuffle-card"></div>
              <div className="shuffle-card"></div>
              <div className="shuffle-card"></div>
              <div className="shuffle-card"></div>
            </div>
          ) : (
            <button 
              className="shuffle-button"
              data-testid="game-shuffle-cards"
              onClick={handleShuffleAndDeal}
            >
              <span className="button-text">Shuffle Cards</span>
              <div className="button-shine"></div>
            </button>
          )}
        </div>
      </div>
    );
  };
  
  // If in welcome phase, show welcome screen
  if (gameState?.phase === 'welcome') {
    return renderWelcomePhase();
  }
  
  // Add a new function to handle skipping the second move
  const handleSkipSecondMove = () => {
    setPromptMessage('You have chosen to skip your second move.');
    setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
    
    // End the player's turn
    Log('Ending turn after skipping second move of 9 card split');
    handleEndTurn(gameState, 'skip_second_move');
  };

  // Add handler for revealing hand
  const handleRevealHand = () => {
    setShowCards(true);
  };

  return (
    <div className="game-controller">
      <div className="game-container">
        {/* NEW TOP PANEL for turn indicator and controls */}
        <div className="top-panel">
          {/* Empty div for spacing */}
          <div className="top-panel-spacer" aria-hidden="true"></div>
          
          {/* Player turn indicator */}
          <div 
            className="player-turn-indicator"
            style={{ '--turn-color': currentPlayerColor } as React.CSSProperties}
          >
            {currentPlayer?.name}'s Turn
          </div>
          
          {/* Dev Mode Toggle */}
          <div className="dev-tools">
            <div className="dev-mode-container">
              <label className="dev-switch">
                <input 
                  type="checkbox" 
                  checked={devMode} 
                  data-testid="dev-mode-toggle"
                  onChange={() => setDevMode(!devMode)} 
                />
                <span className="dev-slider"></span>
                <span className="dev-label">Dev Mode</span>
              </label>
              
              {/* Dev mode controls */}
              {devMode && gameState.phase === 'playing' && (
                <div className="dev-controls-group">
                  <button
                    className="dev-button shuffle-hand-button"
                    data-testid="dev-shuffle-hand"
                    onClick={handleShuffleHand}
                  >
                    Shuffle Hand
                  </button>
                  
                  <button
                    className={`dev-button move-pegs-button ${movePegsMode ? 'active' : ''}`}
                    data-testid="dev-edit-pegs"
                    onClick={() => setMovePegsMode(!movePegsMode)}
                  >
                    {movePegsMode ? 'Exit Peg Edit Mode' : 'Edit Peg Positions'}
                  </button>
                  
                  <button
                    className={`dev-button preserve-play-button ${preservePlayMode ? 'active' : ''}`}
                    data-testid="dev-auto-end-turn"
                    onClick={() => setPreservePlayMode(!preservePlayMode)}
                  >
                    {preservePlayMode ? 'Auto End Turn Off' : 'Auto End Turn On'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Main game board area */}
        <div className="board-area">
          <div className="board-container-wrapper">
            <div className="board-container">
              <Board
                board={gameState?.board}
                onSpaceClick={handleSpaceSelect}
                onPegSelect={handlePegSelect}
                selectedPegId={selectedPegId}
                currentPlayerId={currentPlayer?.id}
                selectableSpaceIds={selectableSpaceIds}
                selectablePegIds={selectablePegIds}
                playerColors={playerColors}
                moveHighlight={recentMoveHighlight}
                zoomLevel={zoomLevel * responsiveScale} // Combine user zoom with responsive scale
              />
              
              {floatingElements.map(element => (
                <div
                  key={element.id}
                  className={`floating-element ${element.type}`}
                  style={{
                    backgroundColor: element.type === 'peg' ? element.color : undefined,
                    left: `${element.x}%`,
                    top: `${element.y}%`,
                    transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
                  }}
                />
              ))}
            </div>
          </div>
          
          {/* Add zoom controls */}
          <div className="zoom-controls">
            <button 
              className={`zoom-button ${isPinchActive ? 'disabled' : ''}`} 
              onClick={handleZoomIn}
              disabled={isPinchActive}
            >+</button>
            <div className="zoom-level">{Math.round(zoomLevel * 100)}%</div>
            <button 
              className={`zoom-button ${isPinchActive ? 'disabled' : ''}`} 
              onClick={handleZoomOut}
              disabled={isPinchActive}
            >−</button>
            <button 
              className={`zoom-button reset-zoom ${isPinchActive ? 'disabled' : ''}`} 
              onClick={handleResetZoom} 
              title="Reset zoom"
              disabled={isPinchActive}
            >
              <span style={{ fontSize: '14px' }}>⟲</span>
            </button>
          </div>
          
          {/* Card controls container - positioned at bottom of board area */}
          <div className="card-controls-container">
            {(promptMessage || bumpMessage) && (
              <div className="prompt-message">
                {promptMessage && <div>{promptMessage}</div>}
                {bumpMessage && <div className="bump-message">{bumpMessage}</div>}
              </div>
            )}
            
            {/* Castle Entry prompt */}
            {castlePromptState.isActive && (
              <div className="castle-choice-controls">
                <button
                  className="castle-choice-button enter"
                  onClick={() => handleCastleChoice(true)}
                >
                  Yes, enter castle
                </button>
                <button 
                  className="castle-choice-button continue"
                  onClick={() => handleCastleChoice(false)}
                >
                  No, continue on board
                </button>
              </div>
            )}
            
            {/* Skip Second Move Button for 9 card when no valid moves */}
            {nineCardState.state === 'NO_VALID_SECOND_MOVES' && (
              <div className="skip-second-move">
                <p>No valid moves are available for the second part of your 9 card split.</p>
                <button data-testid="nine-skip-second-move" onClick={handleSkipSecondMove}>
                  Skip Second Move & End Turn
                </button>
              </div>
            )}
            
            {selectedCardId && gameState?.players[gameState?.currentPlayerIndex]?.hand.find(c => c.id === selectedCardId)?.rank === '9' && (
              <div className="nine-card-controls">
                {/* Initial option selection: Move 9 or Split 9 */}
                {nineCardState.state === 'INITIAL' && !nineCardState.splitSelected && (
                  <>
                    <button data-testid="nine-option-move" onClick={() => handleNineCardOption('move')}>Move 9: move 1 peg forward 9</button>
                    <button data-testid="nine-option-split" onClick={() => handleNineCardOption('split')}>Split 9: 2 pegs, 1 moves forward, 1 moves backward, total movement adds up to 9</button>
                  </>
                )}
                
                {/* Direction selection for split move */}
                {nineCardState.state === 'INITIAL' && nineCardState.splitSelected && (
                  <div className="direction-input">
                    <button data-testid="nine-direction-forward" onClick={() => handleNineCardDirection('forward')}>
                      <span>Forward First</span>
                    </button>
                    <button data-testid="nine-direction-backward" onClick={() => handleNineCardDirection('backward')}>
                      <span>Backward First</span>
                    </button>
                  </div>
                )}
                
                {/* Split mode - Step input */}
                {nineCardState.state === 'SPLIT_SELECT_STEPS' && nineCardState.splitSelected && (
                  <div className="steps-input">
                    <p>
                      {nineCardState.direction
                        ? getNineSplitStepQuestion(nineCardState.direction)
                        : 'How many spaces would you like to move first?'}
                    </p>
                    <div className="step-buttons-grid">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                        <button 
                          key={num}
                          data-testid={`nine-step-${num}`}
                          onClick={() => handleNineCardSteps(num)}
                          className="step-button"
                        >
                          <span className="step-number">{num}</span>
                          {nineCardState.direction === 'forward' && (
                            <span className="step-direction">
                              <span className="forward-text">{num} forward</span>
                              <span className="backward-text">{9-num} backward</span>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {selectedCardId && gameState?.players[gameState?.currentPlayerIndex]?.hand.find(c => c.id === selectedCardId)?.rank === '7' && (
              <div className="seven-card-controls">
                {!sevenCardState.isSplit && !sevenCardState.firstMoveSteps && (
                  <>
                    <button data-testid="seven-option-move" onClick={() => handleSevenCardOption('move')}>Move 1 peg forward 7</button>
                    <button data-testid="seven-option-split" onClick={() => handleSevenCardOption('split')}>Split between 2 pegs</button>
                  </>
                )}
                {sevenCardState.isSplit && !sevenCardState.firstMoveSteps && (
                  <div className="steps-input">
                    {[1, 2, 3, 4, 5, 6].map(num => (
                      <button 
                        key={num}
                        data-testid={`seven-step-${num}`}
                        onClick={() => handleSevenCardSteps(num)}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom panel with cards */}
        <div className="bottom-panel">
          <div className="card-hand-container">
            {/* Reveal Hand button (only show in local play when cards are hidden) */}
            {!isMultiplayer && !showCards && (
              <button 
                className="reveal-hand-button"
                data-testid="game-reveal-hand"
                onClick={handleRevealHand}
                style={{ '--player-color': currentPlayerColor } as React.CSSProperties}
              >
                Reveal Hand
              </button>
            )}

            {isMultiplayer && handOwner && (
              <p className="multiplayer-hand-caption">
                {isCurrentPlayerTurn
                  ? `Your hand: ${handOwner.name}`
                  : `Your hand while waiting: ${handOwner.name}`}
              </p>
            )}
            
            <CardHand 
              cards={handOwner?.hand || []}
              selectedCardId={selectedCardId}
              onCardSelect={handleCardSelect}
              showCards={isMultiplayer ? true : showCards}
              playerColor={handOwnerColor}
            />
            
            {/* Discard button */}
            {shouldShowDiscardButton && (
              <button 
                className="discard-hand-button"
                onClick={handleDiscardAndRedraw}
              >
                Discard Hand
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Game over overlay */}
      {gameState?.phase === 'gameOver' && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>Game Over!</h2>
            <p>Team {gameState.winner?.teamId} wins!</p>
            <button onClick={() => window.location.reload()}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameController; 
