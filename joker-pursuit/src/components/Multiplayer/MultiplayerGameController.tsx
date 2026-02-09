import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMultiplayer, MultiplayerPlayer } from '../../context/MultiplayerContext';
import { GameState } from '../../models/GameState';
import { createBoard } from '../../models/BoardModel';
import { Card, Rank, Suit, createDecks, shuffleDeck } from '../../models/Card';
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

const getReadableTextColor = (backgroundColor?: string): string => {
  if (!backgroundColor || !backgroundColor.startsWith('#')) {
    return '#f1f8ff';
  }

  const hex = backgroundColor.slice(1);
  const normalizedHex = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;

  if (normalizedHex.length !== 6) {
    return '#f1f8ff';
  }

  const red = parseInt(normalizedHex.slice(0, 2), 16);
  const green = parseInt(normalizedHex.slice(2, 4), 16);
  const blue = parseInt(normalizedHex.slice(4, 6), 16);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return '#f1f8ff';
  }

  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness >= 160 ? '#10202f' : '#f1f8ff';
};

const MultiplayerGameController: React.FC<MultiplayerGameControllerProps> = ({ onBack }) => {
  const { 
    isOnlineMode,
    isHost,
    roomCode,
    playerId,
    sessionToken,
    players,
    playersPresence,
    stateVersion,
    updatePlayerColor,
    submitAction,
    requestSync,
    leaveRoom,
    socket
  } = useMultiplayer();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isCurrentPlayerTurn, setIsCurrentPlayerTurn] = useState<boolean>(false);
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string>('');
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [gamePhase, setGamePhase] = useState<'setup' | 'colorSelection' | 'shuffling' | 'playing'>('colorSelection');
  const [recentMove, setRecentMove] = useState<RecentMove | null>(null);
  const [recentMoveHighlight, setRecentMoveHighlight] = useState<RecentMoveHighlight | undefined>(undefined);
  const [appliedSnapshotVersion, setAppliedSnapshotVersion] = useState<number>(0);
  const [presenceNow, setPresenceNow] = useState<number>(() => Date.now());
  const latestSnapshotVersionRef = useRef<number>(0);
  const gameStateRef = useRef<GameState | null>(null);
  const getCurrentBaseVersion = useCallback((): number => {
    return Math.max(latestSnapshotVersionRef.current, stateVersion, appliedSnapshotVersion);
  }, [stateVersion, appliedSnapshotVersion]);

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

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (stateVersion > latestSnapshotVersionRef.current) {
      latestSnapshotVersionRef.current = stateVersion;
      setAppliedSnapshotVersion(stateVersion);
    }
  }, [stateVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Register socket event listeners once and apply snapshots monotonically.
  useEffect(() => {
    if (!isOnlineMode || !socket) return;

    const applyIncomingGameState = (incomingState: GameState, incomingVersion?: number) => {
      const normalizedGameState = normalizeGameStateForClient(incomingState);
      if (!normalizedGameState || !normalizedGameState.players) {
        console.error('Invalid game state snapshot received:', incomingState);
        return;
      }

      if (
        typeof incomingVersion === 'number' &&
        incomingVersion <= latestSnapshotVersionRef.current
      ) {
        return;
      }

      if (typeof incomingVersion === 'number') {
        latestSnapshotVersionRef.current = incomingVersion;
        setAppliedSnapshotVersion(incomingVersion);
      }

      const previousState = gameStateRef.current;
      const inferredMove = inferRecentMove(previousState, normalizedGameState);
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

      const clonedState = cloneGameState(normalizedGameState);
      setGameState(clonedState);
      setGamePhase('playing');
      setCurrentTurnPlayer(normalizedGameState.players[normalizedGameState.currentPlayerIndex]?.name || '');
      setIsCurrentPlayerTurn(
        normalizedGameState.players[normalizedGameState.currentPlayerIndex]?.id === playerId
      );
    };

    const onRoomSnapshot = (snapshot: {
      roomCode: string;
      stateVersion: number;
      gameState: GameState | null;
      selfPlayerId?: string;
    }) => {
      if (!snapshot?.gameState) {
        return;
      }

      if (roomCode && snapshot.roomCode?.toUpperCase() !== roomCode.toUpperCase()) {
        return;
      }

      applyIncomingGameState(snapshot.gameState, snapshot.stateVersion);
    };

    const onActionRejected = (payload: {
      reason?: string;
      expectedVersion?: number;
      snapshot?: {
        stateVersion?: number;
        gameState?: GameState | null;
      };
    }) => {
      console.warn('Action rejected by server:', payload?.reason || 'unknown_reason');

      if (typeof payload?.expectedVersion === 'number') {
        latestSnapshotVersionRef.current = Math.max(
          latestSnapshotVersionRef.current,
          payload.expectedVersion
        );
        setAppliedSnapshotVersion(prev => Math.max(prev, payload.expectedVersion || prev));
      }

      if (payload?.snapshot?.gameState) {
        applyIncomingGameState(payload.snapshot.gameState, payload.snapshot.stateVersion);
      } else {
        requestSync().catch((error: Error) => {
          console.error('Failed to request sync after action rejection', error);
        });
      }
    };

    // Legacy fallback listeners remain for rollback mode.
    const onLegacyGameStateUpdate = (updatedGameState: GameState) => {
      applyIncomingGameState(updatedGameState);
    };

    socket.on('room-snapshot-v2', onRoomSnapshot);
    socket.on('action-rejected-v2', onActionRejected);
    socket.on('game-state-updated', onLegacyGameStateUpdate);

    return () => {
      socket.off('room-snapshot-v2', onRoomSnapshot);
      socket.off('action-rejected-v2', onActionRejected);
      socket.off('game-state-updated', onLegacyGameStateUpdate);
    };
  }, [isOnlineMode, playerId, requestSync, roomCode, socket]);

  // Handle player making a move
  const handleMove = async (moveData: any) => {
    if (!roomCode || !sessionToken || !playerId || !isCurrentPlayerTurn) {
      console.error('❌ Cannot make move: not connected or not your turn');
      return;
    }
    
    console.log('🎮 Handling move:', moveData);

    if (!moveData?.nextGameState) {
      console.error('❌ Missing nextGameState in multiplayer move payload');
      return;
    }

    const nextGameState = serializeGameStateForServer(moveData.nextGameState as GameState);
    const actionType: 'play_move' | 'discard_hand' | 'skip_second_move' =
      moveData?.type === 'discard_hand' || moveData?.type === 'skip_second_move'
        ? moveData.type
        : 'play_move';

    try {
      await submitAction(getCurrentBaseVersion(), {
        type: actionType,
        nextGameState
      });
    } catch (error) {
      console.error('❌ Error sending move to server:', error);
      requestSync().catch((syncError: Error) => {
        console.error('Failed to recover by syncing after move submit failure', syncError);
      });
    }
  };

  const handleHarnessSyncToServer = useCallback(async () => {
    try {
      await requestSync();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to sync from server.'
      };
    }
  }, [requestSync]);

  const handleHarnessCommitStateToServer = useCallback(async (nextState: GameState) => {
    if (!roomCode || !sessionToken || !isHost) {
      return {
        ok: false,
        error: 'Only the online host can commit harness state to the server.'
      };
    }

    try {
      const serializedState = serializeGameStateForServer(nextState);
      await submitAction(getCurrentBaseVersion(), {
        type: 'phase_transition',
        phase: 'playing',
        nextGameState: serializedState
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to commit harness state.'
      };
    }
  }, [getCurrentBaseVersion, isHost, roomCode, sessionToken, submitAction]);

  // Handle color selection
  const handleColorSelect = async (color: string) => {
    if (!isOnlineMode || !roomCode) return;
    
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
  const sendInitialGameState = async () => {
    if (!isOnlineMode || !roomCode || !sessionToken || !isHost || players.length === 0) {
      return;
    }

    const deck = generateShuffledDeck(players.length);

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

    try {
      await submitAction(getCurrentBaseVersion(), {
        type: 'phase_transition',
        phase: 'playing',
        nextGameState: initialGameStateForServer
      });
    } catch (error) {
      console.error('Failed to submit initial multiplayer game state', error);
      requestSync().catch((syncError: Error) => {
        console.error('Failed to request sync after initial game state submit error', syncError);
      });
    }
  };

  // Function to proceed to the game after color selection
  const handleProceedToGame = () => {
    if (!isOnlineMode || !roomCode || !isHost) return;

    setGamePhase('shuffling');

    // Give clients a brief moment to transition to the shuffling screen
    setTimeout(() => {
      sendInitialGameState().catch((error: Error) => {
        console.error('Failed while sending initial game state', error);
      });
    }, 750);
  };

  const generateShuffledDeck = (playerCount: number): Card[] => {
    // Match local mode: one shared pile containing one full deck per player.
    return shuffleDeck(createDecks(playerCount));
  };

  const handleLeaveGame = () => {
    leaveRoom();
    onBack();
  };

  const memoizedPlayerNames = useMemo(
    () => gameState?.players.map(player => player.name) || [],
    [gameState]
  );

  const memoizedPlayerColors = useMemo(
    () =>
      gameState?.players.reduce(
        (colors, player) => ({ ...colors, [player.id]: player.color || '#CCCCCC' }),
        {} as Record<string, string>
      ) || {},
    [gameState]
  );

  const memoizedGameStateOverride = useMemo(
    () => (gameState ? cloneGameState(gameState) : undefined),
    [gameState]
  );

  const getPresenceLabel = (targetPlayerId: string): string => {
    const presence = playersPresence[targetPlayerId];
    if (!presence) {
      return 'Unknown';
    }

    if (presence.status === 'connected') {
      return 'Connected';
    }

    if (presence.status === 'reconnecting') {
      if (presence.graceExpiresAt) {
        const remainingMs = Math.max(0, presence.graceExpiresAt - presenceNow);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        return `Reconnecting (${remainingSeconds}s)`;
      }
      return 'Reconnecting';
    }

    return 'Disconnected';
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
                  data-testid={`multiplayer-color-${color.name.toLowerCase()}`}
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
              data-testid="multiplayer-start-game"
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
      const localPlayer = gameState.players.find((player) => player.id === playerId);
      const activeTurnColor = currentPlayer?.color
        || (currentPlayer?.id ? selectedColors[currentPlayer.id] : undefined)
        || '#284258';
      const localPlayerColor = localPlayer?.color
        || (localPlayer?.id ? selectedColors[localPlayer.id] : undefined)
        || activeTurnColor;
      const turnPopupColor = isCurrentPlayerTurn ? localPlayerColor : activeTurnColor;
      const turnPopupTextColor = getReadableTextColor(turnPopupColor);
      const activeTurnPlayerName = currentTurnPlayer || currentPlayer?.name || 'opponent';

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
              <button
                type="button"
                className="skeuomorphic-button secondary-button"
                onClick={() => {
                  requestSync().catch((error: Error) => {
                    console.error('Failed to sync during match', error);
                  });
                }}
              >
                <span className="button-text">Sync</span>
                <div className="button-shine"></div>
              </button>
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
                  <span className="helper-text"> {getPresenceLabel(player.id)}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div
            className={`player-waiting-overlay ${isCurrentPlayerTurn ? 'your-turn' : 'opponent-turn'}`}
            style={
              {
                '--turn-popup-color': turnPopupColor,
                '--turn-popup-text-color': turnPopupTextColor
              } as React.CSSProperties
            }
          >
            <div className="player-waiting-message">
              <h3>{isCurrentPlayerTurn ? "It's your turn!" : `Waiting for ${activeTurnPlayerName}`}</h3>
              {isCurrentPlayerTurn ? (
                <p>Play a card and make your move.</p>
              ) : (
                <p>{activeTurnPlayerName} is making a move<span className="loading-dots"></span></p>
              )}
            </div>
          </div>

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
            playerNames={memoizedPlayerNames}
            playerTeams={{}}
            numBoardSections={gameState.players.length}
            playerColors={memoizedPlayerColors}
            isMultiplayer={true}
              isCurrentPlayerTurn={isCurrentPlayerTurn}
              onMove={handleMove}
              gameStateOverride={memoizedGameStateOverride}
              localPlayerId={playerId || undefined}
              recentMoveHighlight={recentMoveHighlight}
              onHarnessSyncToServer={handleHarnessSyncToServer}
              onHarnessCommitStateToServer={handleHarnessCommitStateToServer}
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
