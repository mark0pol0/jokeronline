import React, { useState, useEffect } from 'react';
import { useMultiplayer, MultiplayerPlayer } from '../../context/MultiplayerContext';
import { GameState } from '../../models/GameState';
import { createBoard } from '../../models/BoardModel';
import { Card, Rank, Suit } from '../../models/Card';
import GameController from '../Game/GameController';
import './MultiplayerStyles.css';

interface MultiplayerGameControllerProps {
  onBack: () => void;
}

const normalizeGameStateForClient = (state: GameState): GameState => {
  if (!state?.board?.allSpaces || state.board.allSpaces instanceof Map) {
    return state;
  }

  const allSpacesMap = new Map(Object.entries(state.board.allSpaces as Record<string, any>));
  return {
    ...state,
    board: {
      ...state.board,
      allSpaces: allSpacesMap
    } as GameState['board']
  };
};

const serializeGameStateForServer = (state: GameState): GameState => {
  if (!state?.board?.allSpaces || !(state.board.allSpaces instanceof Map)) {
    return state;
  }

  return {
    ...state,
    board: {
      ...state.board,
      allSpaces: Object.fromEntries(state.board.allSpaces)
    } as unknown as GameState['board']
  };
};

const cloneGameState = (state: GameState): GameState => {
  const serializableState = serializeGameStateForServer(state);
  return normalizeGameStateForClient(JSON.parse(JSON.stringify(serializableState)) as GameState);
};

interface RecentMove {
  id: string;
  playerId: string;
  playerName: string;
  card?: Card;
  movedPegId?: string;
  fromSpaceId?: string;
  toSpaceId?: string;
  occurredAt: number;
}

interface RecentMoveHighlight {
  id: string;
  fromSpaceId?: string;
  toSpaceId?: string;
  playerColor?: string;
}

const getPegSpaceMap = (state: GameState | null): Map<string, string> => {
  const pegMap = new Map<string, string>();
  if (!state?.board?.allSpaces) {
    return pegMap;
  }

  state.board.allSpaces.forEach((space, spaceId) => {
    (space.pegs || []).forEach((pegId: string) => {
      pegMap.set(pegId, spaceId);
    });
  });

  return pegMap;
};

const inferRecentMove = (previousState: GameState | null, nextState: GameState): RecentMove | null => {
  if (!previousState?.players?.length || !nextState?.players?.length) {
    return null;
  }

  const previousActivePlayer = previousState.players[previousState.currentPlayerIndex];
  if (!previousActivePlayer) {
    return null;
  }

  const previousPegSpaces = getPegSpaceMap(previousState);
  const nextPegSpaces = getPegSpaceMap(nextState);
  const previousMoveCount = previousState.moves?.length || 0;
  const nextMoveCount = nextState.moves?.length || 0;
  const latestRecordedMove = nextMoveCount > previousMoveCount
    ? nextState.moves[nextMoveCount - 1]
    : undefined;

  const inferredActor = latestRecordedMove
    ? nextState.players.find(player => player.id === latestRecordedMove.playerId) || previousActivePlayer
    : previousActivePlayer;

  const movedPegs: Array<{ pegId: string; fromSpaceId: string; toSpaceId: string }> = [];
  previousPegSpaces.forEach((fromSpaceId, pegId) => {
    const toSpaceId = nextPegSpaces.get(pegId);
    if (toSpaceId && toSpaceId !== fromSpaceId) {
      movedPegs.push({ pegId, fromSpaceId, toSpaceId });
    }
  });

  const recordedPegMove = latestRecordedMove
    ? {
        pegId: latestRecordedMove.pegId,
        fromSpaceId: previousPegSpaces.get(latestRecordedMove.pegId),
        toSpaceId: latestRecordedMove.destinations?.[0] || nextPegSpaces.get(latestRecordedMove.pegId)
      }
    : undefined;

  const preferredPegMove = movedPegs.find(({ pegId }) =>
    pegId.startsWith(`${inferredActor.id}-peg-`)
  );
  const primaryPegMove = recordedPegMove?.fromSpaceId && recordedPegMove?.toSpaceId
    ? {
        pegId: recordedPegMove.pegId,
        fromSpaceId: recordedPegMove.fromSpaceId,
        toSpaceId: recordedPegMove.toSpaceId
      }
    : (preferredPegMove || movedPegs[0]);

  const previousDiscardCount = previousState.discardPile?.length || 0;
  const nextDiscardCount = nextState.discardPile?.length || 0;
  let playedCard: Card | undefined;

  if (nextDiscardCount > previousDiscardCount) {
    playedCard = nextState.discardPile[nextDiscardCount - 1];
  }

  if (!playedCard) {
    const nextVersionOfPlayer = nextState.players.find(player => player.id === inferredActor.id);
    if (nextVersionOfPlayer) {
      const previousVersionOfPlayer = previousState.players.find(player => player.id === inferredActor.id);
      const nextHandIds = new Set(nextVersionOfPlayer.hand.map(card => card.id));
      playedCard = previousVersionOfPlayer?.hand.find(card => !nextHandIds.has(card.id));
    }
  }

  if (!playedCard && latestRecordedMove?.cardId) {
    const previousVersionOfPlayer = previousState.players.find(player => player.id === inferredActor.id);
    playedCard = previousVersionOfPlayer?.hand.find(card => card.id === latestRecordedMove.cardId);
  }

  if (!playedCard && latestRecordedMove?.cardId) {
    const topDiscardCard = nextState.discardPile?.[nextState.discardPile.length - 1];
    if (topDiscardCard?.id === latestRecordedMove.cardId) {
      playedCard = topDiscardCard;
    }
  }

  if (!playedCard && !primaryPegMove) {
    return null;
  }

  const now = Date.now();
  return {
    id: `${inferredActor.id}-${now}`,
    playerId: inferredActor.id,
    playerName: inferredActor.name,
    card: playedCard,
    movedPegId: primaryPegMove?.pegId,
    fromSpaceId: primaryPegMove?.fromSpaceId,
    toSpaceId: primaryPegMove?.toSpaceId,
    occurredAt: now
  };
};

const formatCardRank = (rank?: Rank): string => {
  if (!rank) {
    return '?';
  }

  switch (rank) {
    case 'ace':
      return 'A';
    case 'jack':
      return 'J';
    case 'queen':
      return 'Q';
    case 'king':
      return 'K';
    case 'joker':
      return 'JOKER';
    default:
      return rank.toUpperCase();
  }
};

const getSuitSymbol = (suit?: Suit): string => {
  switch (suit) {
    case 'hearts':
      return '♥';
    case 'diamonds':
      return '♦';
    case 'clubs':
      return '♣';
    case 'spades':
      return '♠';
    default:
      return '';
  }
};

const getCardToneClass = (card?: Card): 'red' | 'black' | 'joker' => {
  if (!card || card.rank === 'joker') {
    return 'joker';
  }

  if (card.suit === 'hearts' || card.suit === 'diamonds') {
    return 'red';
  }

  return 'black';
};

const MultiplayerGameController: React.FC<MultiplayerGameControllerProps> = ({ onBack }) => {
  const { 
    isOnlineMode,
    isHost,
    roomId,
    roomCode,
    playerId,
    players,
    updatePlayerColor,
    leaveRoom,
    socket
  } = useMultiplayer();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isCurrentPlayerTurn, setIsCurrentPlayerTurn] = useState<boolean>(false);
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string>('');
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [gamePhase, setGamePhase] = useState<'setup' | 'colorSelection' | 'shuffling' | 'playing'>('colorSelection');
  const [gameControllerKey, setGameControllerKey] = useState<number>(0);
  const [recentMove, setRecentMove] = useState<RecentMove | null>(null);
  const [recentMoveHighlight, setRecentMoveHighlight] = useState<RecentMoveHighlight | undefined>(undefined);

  // Keep selected colors in sync with data from the server
  useEffect(() => {
    const syncedColors = players.reduce((acc, player) => {
      if (player.color) {
        acc[player.id] = player.color;
      }
      return acc;
    }, {} as Record<string, string>);

    if (Object.keys(syncedColors).length === 0) {
      return;
    }

    setSelectedColors(prev => {
      let hasChanges = false;
      const updated = { ...prev };

      Object.entries(syncedColors).forEach(([id, color]) => {
        if (updated[id] !== color) {
          updated[id] = color;
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [players]);

  // Register socket event listeners properly
  useEffect(() => {
    if (!isOnlineMode || !socket) return;

    // Set up event listeners for socket events
    const onGameStateUpdate = (updatedGameState: GameState) => {
      const normalizedGameState = normalizeGameStateForClient(updatedGameState);
      console.log("🔄 Received game state update:", {
        currentPlayer: normalizedGameState.players[normalizedGameState.currentPlayerIndex]?.name,
        phase: normalizedGameState.phase,
        myId: playerId
      });
      
      // Check if game state is valid
      if (!normalizedGameState || !normalizedGameState.players) {
        console.error("❌ Invalid game state received:", updatedGameState);
        return;
      }
      
      // Simple flag to check if it's this player's turn
      const isMyTurn = normalizedGameState.players[normalizedGameState.currentPlayerIndex]?.id === playerId;
      console.log(`👤 Turn status: ${isMyTurn ? "It's MY turn" : "It's NOT my turn"}`);

      const inferredMove = inferRecentMove(gameState, normalizedGameState);
      if (inferredMove) {
        const movePlayer = normalizedGameState.players.find(player => player.id === inferredMove.playerId);
        setRecentMove(inferredMove);
        setRecentMoveHighlight(
          inferredMove.toSpaceId
            ? {
                id: inferredMove.id,
                fromSpaceId: inferredMove.fromSpaceId,
                toSpaceId: inferredMove.toSpaceId,
                playerColor: movePlayer?.color
              }
            : undefined
        );
      } else {
        setRecentMoveHighlight(undefined);
      }
      
      // Set key game state variables
      setGameState(cloneGameState(normalizedGameState));
      setCurrentTurnPlayer(normalizedGameState.players[normalizedGameState.currentPlayerIndex]?.name || '');
      setIsCurrentPlayerTurn(isMyTurn);
      
      // Force a complete re-render of the GameController by updating the key
      // This ensures the controller fully reinitializes with the new state
      setGameControllerKey(prev => prev + 1);
    };

    // Handle moves from other players
    const onPlayerMove = (data: any) => {
      console.log('📣 Received player move:', data);
    };

    // Handle shuffled cards
    const onShuffledCards = (data: any) => {
      console.log('🃏 Received shuffled cards data:', data);
      
      try {
        const gameState = normalizeGameStateForClient(data.gameState);
        
        if (!gameState || !gameState.players) {
          console.error('❌ Invalid game state received from shuffle:', gameState);
          return;
        }
        
        console.log(`🎲 Game started with ${gameState.players.length} players`);
        
        // Add board validation logging
        if (gameState.board) {
          const spacesCount = gameState.board.allSpaces instanceof Map 
            ? gameState.board.allSpaces.size 
            : Object.keys(gameState.board.allSpaces || {}).length;
          
          console.log(`📋 Board validation: ${spacesCount} spaces, ${gameState.board.sections?.length || 0} sections`);
          
          // Check for starting space
          let foundStartingSpace = false;
          gameState.board.allSpaces.forEach((space, id) => {
            if (foundStartingSpace) return;
            if (space.type === 'starting' || id.includes('_starting')) {
              console.log(`🎯 Found starting space ${id} with ${space.pegs?.length || 0} pegs`);
              foundStartingSpace = true;
            }
          });
          
          if (!foundStartingSpace) {
            console.warn('⚠️ No starting space found in board!');
          }
        } else {
          console.error('❌ No board found in game state!');
        }
        
        // Check player details
        gameState.players.forEach((player: any) => {
          console.log(`🎮 Player ${player.name} has ${player.hand?.length || 0} cards and ${player.pegs?.length || 0} pegs`);
        });
        
        // Update our local state
        setGameState(cloneGameState(gameState));
        setGamePhase('playing');
        setRecentMove(null);
        setRecentMoveHighlight(undefined);
        
        // Set the current player
        setCurrentTurnPlayer(gameState.players[gameState.currentPlayerIndex]?.name || '');
        
        // Check if it's our turn
        const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === playerId;
        setIsCurrentPlayerTurn(isMyTurn);
        
        console.log(`👤 Initial turn: ${isMyTurn ? "It's MY turn" : "It's NOT my turn"}`);
        
        // Force a rerender of the GameController
        setGameControllerKey(prev => prev + 1);
      } catch (error) {
        console.error('❌ Error processing shuffled cards:', error);
      }
    };

    // Handle color update - THIS IS THE KEY FIX
    const onPlayerColorUpdate = (data: { playerId: string, color: string }) => {
      console.log('Player color updated received:', data);
      
      // Update the selected colors directly
      setSelectedColors(prev => ({
        ...prev,
        [data.playerId]: data.color
      }));
    };

    // Handle game phase change
    const onGamePhaseChange = (data: { phase: 'setup' | 'colorSelection' | 'shuffling' | 'playing' }) => {
      setGamePhase(data.phase);
    };

    // Set up event listeners
    socket.on('game-state-updated', onGameStateUpdate);
    socket.on('player-move', onPlayerMove);
    socket.on('shuffled-cards', onShuffledCards);
    socket.on('player-color-updated', onPlayerColorUpdate);
    socket.on('game-phase-changed', onGamePhaseChange);
    
    // For debugging only - uncomment if needed
    // socket.onAny((event, ...args) => {
    //   console.log(`🔌 Socket event: ${event}`, args);
    // });
    
    return () => {
      // Clean up event listeners
      socket.off('game-state-updated', onGameStateUpdate);
      socket.off('player-move', onPlayerMove);
      socket.off('shuffled-cards', onShuffledCards);
      socket.off('player-color-updated', onPlayerColorUpdate);
      socket.off('game-phase-changed', onGamePhaseChange);
      // socket.offAny();
    };
  }, [gameState, isOnlineMode, playerId, socket]);

  // Update game state on the server
  const updateGameState = (newGameState: GameState) => {
    if (!isOnlineMode || !roomId) return;
    sendGameStateUpdate(newGameState);
    setGameState(cloneGameState(normalizeGameStateForClient(newGameState)));
  };

  // Handle player making a move
  const handleMove = (moveData: any) => {
    if (!socket || !roomId || !playerId || !isCurrentPlayerTurn) {
      console.error('❌ Cannot make move: not connected or not your turn');
      return;
    }
    
    console.log('🎮 Handling move:', moveData);
    
    // Add current player ID to the move data
    const playerMoveData = {
      ...moveData,
      playerId
    };
    
    // Send the move to the server
    socket.emit('player-move', {
      roomId,
      moveData: playerMoveData
    }, (response: any) => {
      if (response && response.success) {
        console.log('✅ Move successfully sent to server');
      } else {
        console.error('❌ Error sending move to server:', response?.error);
      }
    });
  };

  // Handle color selection
  const handleColorSelect = async (color: string) => {
    if (!isOnlineMode || !roomId) return;
    
    try {
      // Update color in the server
      await updatePlayerColor(color);
      
      // Update local state
      setSelectedColors(prev => ({
        ...prev,
        [playerId!]: color
      }));
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  };

  // Prepare and send the initial online game state (host only)
  const sendInitialGameState = () => {
    if (!isOnlineMode || !roomId || !isHost || players.length === 0) {
      return;
    }

    const deck = generateShuffledDeck();

    const playerColorsBySection = players.reduce((colors, player, index) => {
      const color = selectedColors[player.id] || player.color || '#CCCCCC';
      colors[`player_${index + 1}`] = color;
      return colors;
    }, {} as Record<string, string>);

    const board = createBoard(
      `board-${Date.now()}`,
      players.length,
      playerColorsBySection
    );

    // Mirror local-mode setup: bind each section to the actual online player id.
    board.sections.forEach((section, index) => {
      const player = players[index];
      if (!player) return;
      section.playerIds = [player.id];
      section.color = selectedColors[player.id] || player.color || '#CCCCCC';
    });

    const playerStates = players.map((player, index) => {
      const color = selectedColors[player.id] || player.color || '#CCCCCC';
      const hand = deck.splice(0, 5);
      const pegIds = Array.from({ length: 5 }, (_, pegIndex) => `${player.id}-peg-${pegIndex + 1}`);

      // Match local-game behavior: start pegs in each section's home slots.
      const homeSlots = Array.from(board.allSpaces.values())
        .filter((space) => space.sectionIndex === index && space.type === 'home')
        .sort((a, b) => a.index - b.index);
      pegIds.forEach((pegId, pegIndex) => {
        if (homeSlots[pegIndex]) {
          homeSlots[pegIndex].pegs.push(pegId);
        }
      });

      return {
        id: player.id,
        name: player.name,
        color,
        hand,
        pegs: pegIds,
        isComplete: false,
        teamId: index
      };
    });

    const serializableBoard = {
      ...board,
      allSpaces: Object.fromEntries(board.allSpaces)
    } as unknown as GameState['board'];

    const initialGameStateForServer: GameState = {
      id: `game-${Date.now()}`,
      players: playerStates,
      currentPlayerIndex: 0,
      phase: 'playing',
      board: serializableBoard,
      drawPile: deck,
      discardPile: [],
      moves: [],
      winner: undefined
    };

    const initialGameStateForClient = normalizeGameStateForClient(initialGameStateForServer);

    console.log('Initial game state created:', initialGameStateForServer);

    setGameState(cloneGameState(initialGameStateForClient));
    setCurrentTurnPlayer(playerStates[0]?.name || '');
    setIsCurrentPlayerTurn(playerStates[0]?.id === playerId);
    setGamePhase('playing');

    socket?.emit('shuffle-cards', {
      roomId,
      deckState: initialGameStateForServer
    });
  };

  // Function to proceed to the game after color selection
  const handleProceedToGame = () => {
    if (!isOnlineMode || !roomId || !isHost) return;

    setGamePhase('shuffling');

    socket?.emit('change-game-phase', { roomId, phase: 'shuffling' });

    // Give clients a brief moment to transition to the shuffling screen
    setTimeout(() => {
      sendInitialGameState();
    }, 750);
  };

  const generateShuffledDeck = (): Card[] => {
    // Create a standard deck of 52 cards + 2 jokers
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Record<string, Rank> = {
      'A': 'ace',
      '2': '2',
      '3': '3',
      '4': '4',
      '5': '5',
      '6': '6',
      '7': '7',
      '8': '8',
      '9': '9',
      '10': '10',
      'J': 'jack',
      'Q': 'queen',
      'K': 'king'
    };
    
    // Create all cards
    const cards: Card[] = [];
    
    // Regular cards
    for (let suitIndex = 0; suitIndex < suits.length; suitIndex++) {
      const suit = suits[suitIndex];
      for (let rankIndex = 0; rankIndex < Object.keys(ranks).length; rankIndex++) {
        const shortRank = Object.keys(ranks)[rankIndex];
        const rank = ranks[shortRank];
        const value = rankIndex + 1; // A=1, 2=2, ..., K=13
        const isFace = rank === 'jack' || rank === 'queen' || rank === 'king';
        
        cards.push({
          id: `${rank}-${suit}-${Date.now()}-${Math.random()}`,
          suit,
          rank,
          value,
          isFace
        });
      }
    }
    
    // Add jokers
    cards.push({
      id: `joker-1-${Date.now()}-${Math.random()}`,
      suit: 'none',
      rank: 'joker',
      value: 0,
      isFace: false
    });
    
    cards.push({
      id: `joker-2-${Date.now()}-${Math.random()}`,
      suit: 'none',
      rank: 'joker',
      value: 0,
      isFace: false
    });
    
    // Shuffle the cards
    return cards.sort(() => Math.random() - 0.5);
  };

  const handleLeaveGame = () => {
    leaveRoom();
    onBack();
  };

  // Render color selection screen
  const renderColorSelection = () => {
    const PLAYER_COLORS = [
      { name: 'Red', value: '#FF5733' },
      { name: 'Blue', value: '#33A1FF' },
      { name: 'Green', value: '#33FF57' },
      { name: 'Purple', value: '#F033FF' },
      { name: 'Yellow', value: '#FFFF33' },
      { name: 'Pink', value: '#FF33A8' },
      { name: 'Cyan', value: '#33FFEC' },
      { name: 'Orange', value: '#FF8C33' }
    ];

    // Filter out colors that are already selected by other players
    const availableColors = PLAYER_COLORS.filter(
      color => !Object.values(selectedColors).includes(color.value) || 
               (playerId && selectedColors[playerId] === color.value)
    );

    // Check if all players have selected a color
    const allPlayersHaveColors = players.every(
      (player: MultiplayerPlayer) => selectedColors[player.id]
    );

    // Check if the current player has selected a color
    const hasSelectedColor = playerId && selectedColors[playerId];

    // Count how many players have selected colors
    const playersWithColors = players.filter(
      (player: MultiplayerPlayer) => selectedColors[player.id]
    ).length;

    return (
      <div className="color-selection-screen">
        <h2>Choose Your Color</h2>
        <p className="multiplayer-lead">Each player must pick a unique color before the game starts.</p>
        
        {/* Player color selection status */}
        <div className="player-color-status">
          <h3>Player Colors</h3>
          <ul>
            {players.map((player: MultiplayerPlayer) => (
              <li key={player.id} className={`player-color-row ${player.id === playerId ? 'current-player' : ''}`}>
                <span className="player-name">
                  {player.name}
                  {player.id === playerId && ' (You)'}
                </span>
                {selectedColors[player.id] ? (
                  <span className="player-selection">
                    <span
                      className="player-color-indicator"
                      style={{ backgroundColor: selectedColors[player.id] }}
                    ></span>
                    {PLAYER_COLORS.find(c => c.value === selectedColors[player.id])?.name}
                  </span>
                ) : (
                  <span className="waiting-selection">selecting...</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Color selection */}
        {!hasSelectedColor ? (
          <>
            <h3>Select your color</h3>
            <div className="color-options">
              {availableColors.map(color => (
                <button
                  key={color.name}
                  className={`color-option ${playerId && selectedColors[playerId] === color.value ? 'selected' : ''}`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => handleColorSelect(color.value)}
                >
                  <span className="color-option-label">{color.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="selected-color-message">
            <p>You selected <span style={{ color: selectedColors[playerId] }}>{PLAYER_COLORS.find(c => c.value === selectedColors[playerId])?.name}</span></p>
          </div>
        )}
        
        {/* Game status messaging */}
        <div className="color-selection-status">
          <p>
            {playersWithColors === players.length 
              ? "All players have selected colors!" 
              : `Waiting for players to select colors... (${playersWithColors}/${players.length})`}
          </p>
        </div>
        
        {/* Start game button for host */}
        {isHost && (
          <div className="proceed-container">
            <button 
              className="skeuomorphic-button primary-button"
              onClick={handleProceedToGame}
              disabled={!allPlayersHaveColors}
            >
              <span className="button-text">Start the Game</span>
              <div className="button-shine"></div>
            </button>
            {!allPlayersHaveColors && (
              <p className="button-hint">Waiting for all players to select colors...</p>
            )}
          </div>
        )}
        
        {/* Message for non-host players */}
        {!isHost && allPlayersHaveColors && (
          <p className="helper-text">All players have selected colors. Waiting for the host to start the game...</p>
        )}
      </div>
    );
  };

  // Define functions not provided directly by the context
  const sendGameStateUpdate = (gameState: GameState) => {
    const serializableGameState = serializeGameStateForServer(gameState);
    // Implementation will depend on your socket service
    console.log('Sending game state update:', serializableGameState);
    // You would typically emit an event to your socket server here
    if (socket) {
      socket.emit('update-game-state', { roomId, gameState: serializableGameState });
    }
  };
  

  // Debug info
  useEffect(() => {
    if (gameState && gamePhase === 'playing') {
      console.log("Game players:", gameState.players);
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const currentPlayer = gameState.players[currentPlayerIndex];

      console.log("Current game state:", {
        phase: gamePhase,
        currentPlayerIndex,
        currentPlayer: currentPlayer ? {
          id: currentPlayer.id,
          name: currentPlayer.name,
          isHost: (currentPlayer as any).isHost
        } : null,
        localPlayerId: playerId,
        isCurrentPlayerTurn: !!(currentPlayer && currentPlayer.id === playerId)
      });
    }
  }, [gameState, gamePhase, playerId]);

  // Debug effect to log game state changes
  useEffect(() => {
    if (gameState) {
      console.log('🎲 Game state changed:', {
        phase: gameState.phase,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentPlayer: gameState.players?.[gameState.currentPlayerIndex]?.name || 'unknown',
        playerCount: gameState.players?.length || 0,
        drawPileSize: gameState.drawPile?.length || 0,
        discardPileSize: gameState.discardPile?.length || 0,
        isLocalPlayerTurn: gameState.players?.[gameState.currentPlayerIndex]?.id === playerId
      });
    }
  }, [gameState, playerId]);

  // Render the appropriate content based on game phase
  const renderGameContent = () => {
    if (gamePhase === 'colorSelection') {
      return renderColorSelection();
    }
    
    if (gamePhase === 'shuffling') {
      return (
        <div className="shuffling-screen">
          <h2>Shuffling cards...</h2>
          <div className="loading-spinner"></div>
          <p>The host is preparing the game.</p>
        </div>
      );
    }
    
    if (gameState && gameState.players && gameState.players.length > 0) {
      const currentPlayerIndex = gameState.currentPlayerIndex || 0;
      const currentPlayer = gameState.players[currentPlayerIndex];
      const recentOpponentMove = recentMove && recentMove.playerId !== playerId ? recentMove : null;
      
      const isCurrentPlayerTurn: boolean = !!(currentPlayer && currentPlayer.id === playerId);

      console.log('🎮 Rendering game with current player turn:', {
        currentPlayerIndex,
        isCurrentPlayerTurn,
        myId: playerId
      });

      console.log("Turn information:", {
        currentPlayerIndex,
        currentPlayerId: currentPlayer?.id,
        localPlayerId: playerId,
        isCurrentPlayerTurn
      });
      
      return (
        <div className="multiplayer-game-container">
          <div className="game-header">
            <div className="room-info">
              <span className="room-code">Room: {roomCode}</span>
              {isHost && <span className="host-badge">Host</span>}
            </div>
            <ul className="game-player-list">
              {gameState.players.map((player, index) => (
                <li key={player.id} className={currentPlayerIndex === index ? 'current-player' : ''}>
                  {player.name} 
                  <span 
                    className="selected-color" 
                    style={{backgroundColor: player.color}}
                  ></span>
                  {currentPlayerIndex === index && ' (Current Turn)'}
                </li>
              ))}
            </ul>
          </div>
          
          {!isCurrentPlayerTurn && (
            <div className="player-waiting-overlay">
              <div className="player-waiting-message">
                <h3>Waiting for {currentTurnPlayer}'s turn</h3>
                <p>Please wait while the other player makes their move<span className="loading-dots"></span></p>
              </div>
            </div>
          )}

          {recentOpponentMove && (
            <aside
              className={`opponent-play-panel ${isCurrentPlayerTurn ? 'during-your-turn' : 'during-opponent-turn'}`}
              key={recentOpponentMove.id}
            >
              <p className="opponent-play-label">{recentOpponentMove.playerName} played</p>
              <div className={`opponent-play-card ${getCardToneClass(recentOpponentMove.card)}`}>
                {recentOpponentMove.card ? (
                  <>
                    <div className="opponent-play-card-top">
                      <span>{formatCardRank(recentOpponentMove.card.rank)}</span>
                      <span>{getSuitSymbol(recentOpponentMove.card.suit)}</span>
                    </div>
                    <div className="opponent-play-card-center">
                      {recentOpponentMove.card.rank === 'joker'
                        ? '★'
                        : getSuitSymbol(recentOpponentMove.card.suit)}
                    </div>
                    <div className="opponent-play-card-bottom">
                      <span>{getSuitSymbol(recentOpponentMove.card.suit)}</span>
                      <span>{formatCardRank(recentOpponentMove.card.rank)}</span>
                    </div>
                  </>
                ) : (
                  <div className="opponent-play-card-center">Card</div>
                )}
              </div>
              <p className="opponent-play-caption">
                {recentOpponentMove.movedPegId ? 'Peg movement highlighted on board.' : 'Move in progress...'}
              </p>
            </aside>
          )}
          
          <GameController 
            key={gameControllerKey}
            playerNames={gameState.players.map(p => p.name)}
            playerTeams={{}}
            numBoardSections={gameState.players.length}
            playerColors={gameState.players.reduce((colors, p) => ({...colors, [p.id]: p.color}), {})}
            isMultiplayer={true}
            isCurrentPlayerTurn={isCurrentPlayerTurn}
            onMove={handleMove}
            onUpdateGameState={updateGameState}
            gameStateOverride={cloneGameState(gameState)}
            localPlayerId={playerId || undefined}
            recentMoveHighlight={recentMoveHighlight}
          />
          
          <button className="leave-game-button" onClick={handleLeaveGame}>
            Leave Game
          </button>
        </div>
      );
    }
    
    return (
      <div className="loading-screen">
        <h2>Loading game...</h2>
        <div className="loading-spinner"></div>
      </div>
    );
  };

  return (
    <div className="multiplayer-game-controller">
      {renderGameContent()}
    </div>
  );
};

export default MultiplayerGameController;
