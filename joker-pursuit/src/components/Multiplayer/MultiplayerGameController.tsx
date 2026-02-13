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

const PLAYER_COLOR_NAME_BY_VALUE = PLAYER_COLORS.reduce((acc, color) => {
  acc[color.value] = color.name;
  return acc;
}, {} as Record<string, string>);
const SNAPSHOT_HYDRATION_RETRY_DELAYS_MS = [0, 1000, 3000];

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
    hostPlayerId,
    roomCode,
    playerId,
    sessionToken,
    players,
    playersPresence,
    isGameStarted,
    isRejoining,
    error,
    stateVersion,
    updatePlayerColor,
    submitAction,
    requestSync,
    leaveRoom,
    socket
  } = useMultiplayer();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string>('');
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [gamePhase, setGamePhase] = useState<'setup' | 'colorSelection' | 'shuffling' | 'playing'>('colorSelection');
  const [recentMove, setRecentMove] = useState<RecentMove | null>(null);
  const [recentMoveHighlight, setRecentMoveHighlight] = useState<RecentMoveHighlight | undefined>(undefined);
  const [appliedSnapshotVersion, setAppliedSnapshotVersion] = useState<number>(0);
  const [presenceNow, setPresenceNow] = useState<number>(() => Date.now());
  const [hydrationAttemptCount, setHydrationAttemptCount] = useState(0);
  const [snapshotHydrationFailed, setSnapshotHydrationFailed] = useState(false);
  const [snapshotSelfPlayerId, setSnapshotSelfPlayerId] = useState<string | null>(null);
  const [returnLinkCopyStatus, setReturnLinkCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const latestSnapshotVersionRef = useRef<number>(0);
  const gameStateRef = useRef<GameState | null>(null);
  const effectivePlayerId = snapshotSelfPlayerId || playerId;
  const isWaitingForStartedGameSnapshot =
    isOnlineMode &&
    isGameStarted &&
    !gameState &&
    stateVersion > 1;
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

      // Accept equal-version snapshots so request-sync/action-rejected payloads can
      // realign optimistic local state even when the server version has not changed.
      if (
        typeof incomingVersion === 'number' &&
        incomingVersion < latestSnapshotVersionRef.current
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

      if (snapshot.selfPlayerId?.trim()) {
        setSnapshotSelfPlayerId(snapshot.selfPlayerId.trim());
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
  }, [isOnlineMode, requestSync, roomCode, socket]);

  useEffect(() => {
    if (!isWaitingForStartedGameSnapshot) {
      setHydrationAttemptCount(0);
      setSnapshotHydrationFailed(false);
      return;
    }

    let isCancelled = false;
    const timers: number[] = [];
    setSnapshotHydrationFailed(false);
    setHydrationAttemptCount(0);

    SNAPSHOT_HYDRATION_RETRY_DELAYS_MS.forEach((delayMs, attemptIndex) => {
      const timer = window.setTimeout(() => {
        if (isCancelled || gameStateRef.current) {
          return;
        }

        const attemptNumber = attemptIndex + 1;
        setHydrationAttemptCount(attemptNumber);
        console.log(
          `[multiplayer] Requesting room snapshot sync (${attemptNumber}/${SNAPSHOT_HYDRATION_RETRY_DELAYS_MS.length})`
        );

        requestSync()
          .catch((syncError: Error) => {
            if (isCancelled || gameStateRef.current) {
              return;
            }

            console.warn(
              `[multiplayer] Snapshot sync attempt ${attemptNumber} failed: ${syncError.message}`
            );
            if (attemptNumber === SNAPSHOT_HYDRATION_RETRY_DELAYS_MS.length) {
              setSnapshotHydrationFailed(true);
            }
          });
      }, delayMs);

      timers.push(timer);
    });

    const hydrationDeadlineMs = SNAPSHOT_HYDRATION_RETRY_DELAYS_MS[SNAPSHOT_HYDRATION_RETRY_DELAYS_MS.length - 1] + 1200;
    const deadlineTimer = window.setTimeout(() => {
      if (!isCancelled && !gameStateRef.current) {
        setSnapshotHydrationFailed(true);
      }
    }, hydrationDeadlineMs);
    timers.push(deadlineTimer);

    return () => {
      isCancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [isWaitingForStartedGameSnapshot, requestSync]);

  // Handle player making a move
  const handleMove = async (moveData: any) => {
    const isLocalPlayersTurn = Boolean(
      gameState?.players?.[gameState.currentPlayerIndex]?.id &&
      gameState.players[gameState.currentPlayerIndex].id === effectivePlayerId
    );

    if (!roomCode || !sessionToken || !effectivePlayerId || !isLocalPlayersTurn) {
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
      if (effectivePlayerId) {
        setSelectedColors(prev => ({
          ...prev,
          [effectivePlayerId]: color
        }));
      }
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

  const handleCopyReturnLink = useCallback(async () => {
    if (!roomCode) {
      return;
    }

    const fallbackName = players.find(player => player.id === effectivePlayerId)?.name
      || gameState?.players.find(player => player.id === effectivePlayerId)?.name
      || '';
    const returnLink = `${window.location.origin}/?room=${encodeURIComponent(roomCode)}${fallbackName ? `&name=${encodeURIComponent(fallbackName)}` : ''}`;

    try {
      await navigator.clipboard.writeText(returnLink);
      setReturnLinkCopyStatus('copied');
    } catch (copyError) {
      console.error('Failed to copy return link', copyError);
      setReturnLinkCopyStatus('failed');
    }
  }, [roomCode, players, effectivePlayerId, gameState]);

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

  const resolvedHostPlayerId = useMemo(
    () => hostPlayerId || players[0]?.id || null,
    [hostPlayerId, players]
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

  const getPresenceTone = (targetPlayerId: string): 'connected' | 'reconnecting' | 'disconnected' | 'unknown' => {
    const presence = playersPresence[targetPlayerId];
    if (!presence) {
      return 'unknown';
    }

    if (presence.status === 'connected') {
      return 'connected';
    }

    if (presence.status === 'reconnecting') {
      return 'reconnecting';
    }

    return 'disconnected';
  };

  const renderStartedGameReconnect = () => {
    const attemptText = hydrationAttemptCount > 0
      ? `Sync attempt ${hydrationAttemptCount}/${SNAPSHOT_HYDRATION_RETRY_DELAYS_MS.length}`
      : 'Preparing to sync your game state...';

    return (
      <div className="loading-screen">
        <h2>Reconnecting to your seat...</h2>
        <div className="loading-spinner"></div>
        <p>
          {isRejoining
            ? 'Reconnecting to your seat...'
            : 'Syncing the latest match snapshot from the server...'}
        </p>
        <p className="helper-text">{attemptText}</p>
        {snapshotHydrationFailed && (
          <>
            <p className="helper-text">
              {error || 'Unable to sync game state. You can retry sync or leave and rejoin.'}
            </p>
            <div className="button-group">
              <button
                type="button"
                className="skeuomorphic-button secondary-button"
                onClick={() => {
                  setSnapshotHydrationFailed(false);
                  requestSync().catch((syncError: Error) => {
                    console.error('Failed to sync after hydration retries', syncError);
                    setSnapshotHydrationFailed(true);
                  });
                }}
              >
                <span className="button-text">Sync now</span>
                <div className="button-shine"></div>
              </button>
              <button
                type="button"
                className="skeuomorphic-button secondary-button leave-action-button"
                onClick={handleLeaveGame}
              >
                <span className="button-text">Leave Game</span>
                <div className="button-shine"></div>
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Render color selection screen
  const renderColorSelection = () => {
    const localPlayerId = effectivePlayerId || null;
    const allPlayersHaveColors = players.every(
      (player: MultiplayerPlayer) => selectedColors[player.id]
    );

    const hasSelectedColor = Boolean(localPlayerId && selectedColors[localPlayerId]);
    const selectedColorValue = localPlayerId ? selectedColors[localPlayerId] : undefined;
    const selectedColorName = selectedColorValue
      ? PLAYER_COLOR_NAME_BY_VALUE[selectedColorValue] || selectedColorValue
      : null;

    const playersWithColors = players.filter(
      (player: MultiplayerPlayer) => selectedColors[player.id]
    ).length;

    const colorOwners = players.reduce((acc, player) => {
      const selected = selectedColors[player.id];
      if (selected) {
        acc[selected] = player.id;
      }
      return acc;
    }, {} as Record<string, string>);

    const getColorStateLabel = (colorValue: string): string | null => {
      const ownerId = colorOwners[colorValue];
      if (!ownerId || ownerId === localPlayerId) {
        return null;
      }

      const owner = players.find(player => player.id === ownerId);
      return owner ? `Taken by ${owner.name}` : 'Taken';
    };

    return (
      <div className="color-selection-screen">
        <h2>Choose Your Color</h2>
        <p className="multiplayer-lead">Each player must pick a unique color before the game starts.</p>

        <div className="color-selection-layout">
          <div className="player-color-status">
            <h3>Player Roster</h3>
            <ul>
              {players.map((player: MultiplayerPlayer) => {
                const colorValue = selectedColors[player.id];
                const isSelf = player.id === localPlayerId;
                const isHostPlayer = player.id === resolvedHostPlayerId;
                const colorName = colorValue ? (PLAYER_COLOR_NAME_BY_VALUE[colorValue] || colorValue) : null;

                return (
                  <li key={player.id} className={`player-color-row ${isSelf ? 'current-player' : ''}`}>
                    <div className="player-color-meta">
                      <span className="player-name">{player.name}</span>
                      <div className="player-role-badges">
                        {isSelf && <span className="inline-badge role-you">You</span>}
                        {isHostPlayer && <span className="inline-badge role-host">Host</span>}
                      </div>
                    </div>
                    {colorValue ? (
                      <span className="player-selection">
                        <span
                          className="player-color-indicator"
                          style={{ backgroundColor: colorValue }}
                        ></span>
                        {colorName}
                      </span>
                    ) : (
                      <span className="waiting-selection">Selecting...</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="color-picker-panel">
            <h3>{hasSelectedColor ? 'Adjust Your Color' : 'Select Your Color'}</h3>
            <div className="color-options">
              {PLAYER_COLORS.map(color => {
                const ownerId = colorOwners[color.value];
                const isTakenByOther = Boolean(ownerId && ownerId !== localPlayerId);
                const isSelected = selectedColorValue === color.value;
                const stateLabel = getColorStateLabel(color.value);

                return (
                  <button
                    key={color.name}
                    className={`color-option ${isSelected ? 'selected' : ''} ${isTakenByOther ? 'taken' : ''}`}
                    style={{ backgroundColor: color.value }}
                    data-testid={`multiplayer-color-${color.name.toLowerCase()}`}
                    onClick={() => handleColorSelect(color.value)}
                    disabled={!localPlayerId || isTakenByOther}
                    title={stateLabel || color.name}
                  >
                    <span className="color-option-label">{color.name}</span>
                    {isSelected && <span className="color-option-state">Selected</span>}
                    {!isSelected && stateLabel && <span className="color-option-state">{stateLabel}</span>}
                  </button>
                );
              })}
            </div>
            {hasSelectedColor && selectedColorName && (
              <div className="selected-color-message">
                <p>
                  You selected <span style={{ color: selectedColorValue }}>{selectedColorName}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="color-selection-status">
          <p>
            {playersWithColors === players.length
              ? 'All players have selected colors!'
              : `Waiting for players to select colors... (${playersWithColors}/${players.length})`}
          </p>
        </div>

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
        localPlayerId: effectivePlayerId,
        isCurrentPlayerTurn: !!(currentPlayer && currentPlayer.id === effectivePlayerId)
      });
    }
  }, [gameState, gamePhase, effectivePlayerId]);

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
        isLocalPlayerTurn: gameState.players?.[gameState.currentPlayerIndex]?.id === effectivePlayerId
      });
    }
  }, [gameState, effectivePlayerId]);

  // Render the appropriate content based on game phase
  const renderGameContent = () => {
    if (isWaitingForStartedGameSnapshot) {
      return renderStartedGameReconnect();
    }

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
      const recentOpponentMove = recentMove && recentMove.playerId !== effectivePlayerId ? recentMove : null;
      
      const isCurrentPlayerTurn: boolean = !!(currentPlayer && currentPlayer.id === effectivePlayerId);
      const localPlayer = gameState.players.find((player) => player.id === effectivePlayerId);
      const activeTurnColor = currentPlayer?.color
        || (currentPlayer?.id ? selectedColors[currentPlayer.id] : undefined)
        || '#284258';
      const localPlayerColor = localPlayer?.color
        || (localPlayer?.id ? selectedColors[localPlayer.id] : undefined)
        || activeTurnColor;
      const turnPopupColor = isCurrentPlayerTurn ? localPlayerColor : activeTurnColor;
      const turnPopupTextColor = getReadableTextColor(turnPopupColor);
      const activeTurnPlayerName = currentTurnPlayer || currentPlayer?.name || 'opponent';
      const inGameHostPlayerId = hostPlayerId || resolvedHostPlayerId || gameState.players[0]?.id || null;

      console.log('🎮 Rendering game with current player turn:', {
        currentPlayerIndex,
        isCurrentPlayerTurn,
        myId: effectivePlayerId
      });

      console.log("Turn information:", {
        currentPlayerIndex,
        currentPlayerId: currentPlayer?.id,
        localPlayerId: effectivePlayerId,
        isCurrentPlayerTurn
      });
      
      return (
        <div className="multiplayer-game-container">
          <div className="game-header">
            <div className="game-header-main-row">
              <div className="room-meta">
                <span className="room-meta-label">Room</span>
                <span className="room-code-chip">{roomCode}</span>
              </div>
              <div className="header-action-group">
                <button
                  type="button"
                  className="skeuomorphic-button secondary-button header-action-button"
                  onClick={handleCopyReturnLink}
                >
                  <span className="button-text">Copy My Return Link</span>
                  <div className="button-shine"></div>
                </button>
                <button
                  type="button"
                  className="skeuomorphic-button secondary-button header-action-button"
                  onClick={() => {
                    requestSync().catch((error: Error) => {
                      console.error('Failed to sync during match', error);
                    });
                  }}
                >
                  <span className="button-text">Sync</span>
                  <div className="button-shine"></div>
                </button>
                <button
                  type="button"
                  className="skeuomorphic-button secondary-button header-action-button leave-action-button"
                  onClick={handleLeaveGame}
                >
                  <span className="button-text">Leave Game</span>
                  <div className="button-shine"></div>
                </button>
              </div>
            </div>
            {returnLinkCopyStatus === 'copied' && (
              <p className="helper-text">Return link copied to clipboard.</p>
            )}
            {returnLinkCopyStatus === 'failed' && (
              <p className="helper-text">Could not copy automatically. Please copy the URL manually.</p>
            )}
            <ul className="game-player-list">
              {gameState.players.map((player, index) => {
                const isSelf = player.id === effectivePlayerId;
                const isTurn = currentPlayerIndex === index;
                const isHostPlayer = player.id === inGameHostPlayerId;
                const presenceLabel = getPresenceLabel(player.id);
                const presenceTone = getPresenceTone(player.id);

                return (
                  <li
                    key={player.id}
                    className={`game-player-chip ${isTurn ? 'is-turn' : ''} ${isSelf ? 'is-self' : ''}`}
                  >
                    <span
                      className="selected-color"
                      style={{ backgroundColor: player.color }}
                    ></span>
                    <span className="chip-player-name">{player.name}</span>
                    <span className="chip-badge-row">
                      {isSelf && <span className="chip-badge role-you">You</span>}
                      {isHostPlayer && <span className="chip-badge role-host">Host</span>}
                      {isTurn && <span className="chip-badge role-turn">Turn</span>}
                      <span className={`chip-badge presence-${presenceTone}`}>{presenceLabel}</span>
                    </span>
                  </li>
                );
              })}
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
              localPlayerId={effectivePlayerId || undefined}
              recentMoveHighlight={recentMoveHighlight}
              onHarnessSyncToServer={handleHarnessSyncToServer}
              onHarnessCommitStateToServer={handleHarnessCommitStateToServer}
          />
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
