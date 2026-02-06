import React, {
  useCallback,
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import socketIOClient from 'socket.io-client';
import { useSocket } from './SocketContext';
import {
  createRoomV2,
  GameActionV2,
  joinRoomV2,
  leaveRoomV2,
  PlayerPresence,
  rejoinRoomV2,
  requestSyncV2,
  RoomSnapshotV2,
  startGameV2,
  submitActionV2,
  updatePlayerColorV2
} from '../services/multiplayerProtocolV2';

// Types for multiplayer state
export interface MultiplayerPlayer {
  id: string;
  name: string;
  color: string;
}

interface CreateRoomResponseV1 {
  success: boolean;
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  players?: MultiplayerPlayer[];
  error?: string;
}

interface JoinRoomResponseV1 {
  success: boolean;
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  players?: MultiplayerPlayer[];
  error?: string;
}

interface StartGameResponseV1 {
  success: boolean;
  error?: string;
}

interface UpdateColorResponseV1 {
  success: boolean;
  error?: string;
}

interface MultiplayerContextType {
  isOnlineMode: boolean;
  isHost: boolean;
  roomId: string | null;
  roomCode: string | null;
  playerId: string | null;
  sessionToken: string | null;
  players: MultiplayerPlayer[];
  playersPresence: Record<string, PlayerPresence>;
  isGameStarted: boolean;
  isRejoining: boolean;
  stateVersion: number;
  error: string | null;
  socket: ReturnType<typeof socketIOClient> | null;

  // Actions
  setOnlineMode: (isOnline: boolean) => void;
  createRoom: (playerName: string) => Promise<void>;
  joinRoom: (roomCode: string, playerName: string) => Promise<void>;
  startGame: () => Promise<void>;
  updatePlayerColor: (color: string) => Promise<void>;
  submitAction: (baseVersion: number, action: GameActionV2) => Promise<void>;
  requestSync: () => Promise<void>;
  leaveRoom: () => void;
  clearError: () => void;
}

const ENABLE_PROTOCOL_V2 = process.env.REACT_APP_ENABLE_PROTOCOL_V2 !== 'false';
const ENABLE_PROTOCOL_V1 = process.env.REACT_APP_ENABLE_PROTOCOL_V1 !== 'false';
const SESSION_STORAGE_PREFIX = 'joker-pursuit.session.';
const CONNECTION_ERROR_PREFIX = 'Unable to reach the server';

interface StoredSession {
  roomCode: string;
  sessionToken: string;
  playerId: string;
}

const getSessionStorageKey = (roomCode: string) =>
  `${SESSION_STORAGE_PREFIX}${roomCode.toUpperCase()}`;

const readStoredSession = (roomCode: string): StoredSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getSessionStorageKey(roomCode));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.sessionToken || !parsed.playerId) {
      return null;
    }

    return {
      roomCode: roomCode.toUpperCase(),
      sessionToken: parsed.sessionToken,
      playerId: parsed.playerId
    };
  } catch (error) {
    console.error('Failed to read stored multiplayer session', error);
    return null;
  }
};

const writeStoredSession = (roomCode: string, sessionToken: string, playerId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const payload: StoredSession = {
      roomCode: roomCode.toUpperCase(),
      sessionToken,
      playerId
    };

    window.localStorage.setItem(getSessionStorageKey(roomCode), JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to persist multiplayer session', error);
  }
};

const clearStoredSession = (roomCode: string | null) => {
  if (!roomCode || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(getSessionStorageKey(roomCode));
  } catch (error) {
    console.error('Failed to clear stored multiplayer session', error);
  }
};

const getRoomCodeFromQueryString = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const queryCode = new URLSearchParams(window.location.search).get('room');
  if (!queryCode) {
    return null;
  }

  const normalized = queryCode.trim().toUpperCase();
  return normalized || null;
};

// Create context with default values
const MultiplayerContext = createContext<MultiplayerContextType>({
  isOnlineMode: false,
  isHost: false,
  roomId: null,
  roomCode: null,
  playerId: null,
  sessionToken: null,
  players: [],
  playersPresence: {},
  isGameStarted: false,
  isRejoining: false,
  stateVersion: 0,
  error: null,
  socket: null,

  setOnlineMode: () => {},
  createRoom: async () => {},
  joinRoom: async () => {},
  startGame: async () => {},
  updatePlayerColor: async () => {},
  submitAction: async () => {},
  requestSync: async () => {},
  leaveRoom: () => {},
  clearError: () => {}
});

interface MultiplayerProviderProps {
  children: ReactNode;
}

export const MultiplayerProvider: React.FC<MultiplayerProviderProps> = ({ children }) => {
  const { socket, isConnected, serverUrl, connectionError } = useSocket();
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [playersPresence, setPlayersPresence] = useState<Record<string, PlayerPresence>>({});
  const [isHost, setIsHost] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);
  const [stateVersion, setStateVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const autoRejoinAttempted = useRef<Set<string>>(new Set());

  const clearError = () => setError(null);

  // Surface connection level errors inside the multiplayer flow
  useEffect(() => {
    setError(prev => {
      if (connectionError) {
        const message = `${CONNECTION_ERROR_PREFIX} at ${serverUrl}. ${connectionError}`;
        return prev === message ? prev : message;
      }

      if (isConnected && prev && prev.startsWith(CONNECTION_ERROR_PREFIX)) {
        return null;
      }

      return prev;
    });
  }, [connectionError, serverUrl, isConnected]);

  useEffect(() => {
    if (!socket || !ENABLE_PROTOCOL_V2) {
      return;
    }

    const onPresenceUpdated = (data: {
      roomCode: string;
      playersPresence: Record<string, PlayerPresence>;
    }) => {
      if (!roomCode || data.roomCode.toUpperCase() === roomCode.toUpperCase()) {
        setPlayersPresence(data.playersPresence || {});
      }
    };

    const onPlayerJoined = (data: {
      roomCode: string;
      players: MultiplayerPlayer[];
      hostPlayerId?: string;
    }) => {
      if (!roomCode || data.roomCode.toUpperCase() === roomCode.toUpperCase()) {
        setPlayers(data.players || []);
        if (data.hostPlayerId && playerId) {
          setIsHost(data.hostPlayerId === playerId);
        }
      }
    };

    const onGameStarted = (data: {
      roomCode: string;
      players: MultiplayerPlayer[];
      hostPlayerId?: string;
    }) => {
      if (!roomCode || data.roomCode.toUpperCase() === roomCode.toUpperCase()) {
        setIsGameStarted(true);
        setPlayers(data.players || []);
        if (data.hostPlayerId && playerId) {
          setIsHost(data.hostPlayerId === playerId);
        }
      }
    };

    const onPlayerColorUpdated = (data: { roomCode: string; playerId: string; color: string }) => {
      if (!roomCode || data.roomCode.toUpperCase() === roomCode.toUpperCase()) {
        setPlayers(prev =>
          prev.map(player =>
            player.id === data.playerId
              ? { ...player, color: data.color }
              : player
          )
        );
      }
    };

    const onRoomSnapshot = (snapshot: RoomSnapshotV2) => {
      if (!roomCode || snapshot.roomCode.toUpperCase() === roomCode.toUpperCase()) {
        setStateVersion(prev => Math.max(prev, snapshot.stateVersion));
        setPlayers(snapshot.players || []);
        setPlayersPresence(snapshot.playersPresence || {});
        setIsGameStarted(Boolean(snapshot.isStarted || snapshot.gameState));
        if (snapshot.hostPlayerId) {
          const selfId = snapshot.selfPlayerId || playerId;
          if (selfId) {
            setIsHost(snapshot.hostPlayerId === selfId);
          }
        }
        if (snapshot.roomId) {
          setRoomId(snapshot.roomId);
        }
      }
    };

    const onHostUpdated = (data: { roomCode: string; hostPlayerId: string }) => {
      if (!roomCode || data.roomCode.toUpperCase() === roomCode.toUpperCase()) {
        if (playerId) {
          setIsHost(data.hostPlayerId === playerId);
        }
      }
    };

    const onActionRejected = (payload: { reason?: string }) => {
      setError(payload?.reason || 'Action rejected. Sync requested.');
    };

    socket.on('presence-updated-v2', onPresenceUpdated);
    socket.on('player-joined-v2', onPlayerJoined);
    socket.on('game-started-v2', onGameStarted);
    socket.on('player-color-updated-v2', onPlayerColorUpdated);
    socket.on('room-snapshot-v2', onRoomSnapshot);
    socket.on('action-rejected-v2', onActionRejected);
    socket.on('host-updated-v2', onHostUpdated);

    return () => {
      socket.off('presence-updated-v2', onPresenceUpdated);
      socket.off('player-joined-v2', onPlayerJoined);
      socket.off('game-started-v2', onGameStarted);
      socket.off('player-color-updated-v2', onPlayerColorUpdated);
      socket.off('room-snapshot-v2', onRoomSnapshot);
      socket.off('action-rejected-v2', onActionRejected);
      socket.off('host-updated-v2', onHostUpdated);
    };
  }, [socket, roomCode, playerId]);

  // Legacy listeners remain for rollback mode
  useEffect(() => {
    if (!socket || !ENABLE_PROTOCOL_V1) {
      return;
    }

    const onPlayerJoined = (data: { players: MultiplayerPlayer[] }) => {
      setPlayers(data.players);
    };

    const onPlayerLeft = (data: { players: MultiplayerPlayer[] }) => {
      setPlayers(data.players);
    };

    const onNewHost = (data: { newHostId: string }) => {
      if (playerId === data.newHostId) {
        setIsHost(true);
      }
    };

    const onGameStarted = (data: { players: MultiplayerPlayer[] }) => {
      setIsGameStarted(true);
      setPlayers(data.players);
    };

    const onPlayerColorUpdated = (data: { playerId: string; color: string }) => {
      setPlayers(prev =>
        prev.map(player =>
          player.id === data.playerId
            ? { ...player, color: data.color }
            : player
        )
      );
    };

    socket.on('player-joined', onPlayerJoined);
    socket.on('player-left', onPlayerLeft);
    socket.on('new-host', onNewHost);
    socket.on('game-started', onGameStarted);
    socket.on('player-color-updated', onPlayerColorUpdated);

    return () => {
      socket.off('player-joined', onPlayerJoined);
      socket.off('player-left', onPlayerLeft);
      socket.off('new-host', onNewHost);
      socket.off('game-started', onGameStarted);
      socket.off('player-color-updated', onPlayerColorUpdated);
    };
  }, [socket, playerId]);

  // Auto rejoin if we have a stored token and a room code from either state or query string.
  useEffect(() => {
    if (!ENABLE_PROTOCOL_V2 || !socket || !isConnected || sessionToken) {
      return;
    }

    const candidateRoomCode = (roomCode || getRoomCodeFromQueryString() || '').toUpperCase();
    if (!candidateRoomCode) {
      return;
    }

    const stored = readStoredSession(candidateRoomCode);
    if (!stored?.sessionToken) {
      return;
    }

    const attemptId = `${socket.id}:${candidateRoomCode}:${stored.sessionToken}`;
    if (autoRejoinAttempted.current.has(attemptId)) {
      return;
    }

    autoRejoinAttempted.current.add(attemptId);
    setIsRejoining(true);

    rejoinRoomV2(socket, candidateRoomCode, stored.sessionToken)
      .then(response => {
        setIsOnlineMode(true);
        setRoomId(response.roomId || null);
        setRoomCode(response.roomCode || candidateRoomCode);
        setPlayerId(response.playerId || stored.playerId);
        setSessionToken(stored.sessionToken);
        setPlayers(response.players || []);
        setIsHost(Boolean(response.isHost));
        setIsGameStarted(Boolean(response.isGameStarted));
        setStateVersion(response.stateVersion || 0);
        writeStoredSession(candidateRoomCode, stored.sessionToken, response.playerId || stored.playerId);
      })
      .catch((rejoinError: Error) => {
        console.warn('Auto rejoin failed:', rejoinError.message);
        setError(rejoinError.message || 'Session expired; rejoin only if lobby not started.');
      })
      .finally(() => {
        setIsRejoining(false);
      });
  }, [socket, isConnected, roomCode, sessionToken]);

  const createRoom = async (playerName: string): Promise<void> => {
    if (!socket) {
      const message = 'Socket connection not available. Please try again later.';
      setError(message);
      return Promise.reject(new Error(message));
    }

    if (!isConnected) {
      const message = 'Not connected to server. Please verify the Socket.IO backend URL and try again.';
      setError(message);
      return Promise.reject(new Error(message));
    }

    setIsOnlineMode(true);

    if (ENABLE_PROTOCOL_V2) {
      const response = await createRoomV2(socket, playerName.trim());
      if (!response.roomCode || !response.playerId || !response.sessionToken) {
        throw new Error('Server did not return room identity.');
      }

      setRoomId(response.roomId || null);
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setSessionToken(response.sessionToken);
      setPlayers(response.players || []);
      setPlayersPresence({});
      setIsHost(true);
      setIsGameStarted(false);
      setStateVersion(response.stateVersion || 1);
      setError(null);
      writeStoredSession(response.roomCode, response.sessionToken, response.playerId);
      return;
    }

    return new Promise((resolve, reject) => {
      socket.emit('create-room', playerName, (response: CreateRoomResponseV1) => {
        if (response.success) {
          setRoomId(response.roomId || null);
          setRoomCode(response.roomCode || null);
          setPlayerId(response.playerId || null);
          setSessionToken(null);
          setIsHost(true);
          setPlayers(response.players || []);
          setError(null);
          resolve();
        } else {
          const message = response.error || 'Failed to create room';
          setError(message);
          reject(new Error(message));
        }
      });
    });
  };

  const joinRoom = async (inputRoomCode: string, playerName: string): Promise<void> => {
    if (!socket) {
      const message = 'Socket connection not available. Please try again later.';
      setError(message);
      return Promise.reject(new Error(message));
    }

    if (!isConnected) {
      const message = 'Not connected to server. Please verify the Socket.IO backend URL and try again.';
      setError(message);
      return Promise.reject(new Error(message));
    }

    const normalizedRoomCode = inputRoomCode.trim().toUpperCase();
    setIsOnlineMode(true);

    if (ENABLE_PROTOCOL_V2) {
      const response = await joinRoomV2(socket, normalizedRoomCode, playerName.trim());
      if (!response.roomCode || !response.playerId || !response.sessionToken) {
        throw new Error('Server did not return room identity.');
      }

      setRoomId(response.roomId || null);
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setSessionToken(response.sessionToken);
      setPlayers(response.players || []);
      setPlayersPresence({});
      setIsHost(Boolean(response.isHost));
      setIsGameStarted(false);
      setStateVersion(response.stateVersion || 1);
      setError(null);
      writeStoredSession(response.roomCode, response.sessionToken, response.playerId);
      return;
    }

    return new Promise((resolve, reject) => {
      socket.emit('join-room', normalizedRoomCode, playerName, (response: JoinRoomResponseV1) => {
        if (response.success) {
          setRoomId(response.roomId || null);
          setRoomCode(response.roomCode || null);
          setPlayerId(response.playerId || null);
          setSessionToken(null);
          setIsHost(false);
          setPlayers(response.players || []);
          setError(null);
          resolve();
        } else {
          const message = response.error || 'Failed to join room';
          setError(message);
          reject(new Error(message));
        }
      });
    });
  };

  const startGame = async (): Promise<void> => {
    if (!socket) {
      const message = 'Socket connection not available. Please try again later.';
      setError(message);
      return Promise.reject(new Error(message));
    }

    if (!roomCode) {
      const message = 'Room not found';
      setError(message);
      return Promise.reject(new Error(message));
    }

    if (ENABLE_PROTOCOL_V2) {
      if (!sessionToken) {
        const message = 'Session token missing. Please rejoin the room.';
        setError(message);
        return Promise.reject(new Error(message));
      }

      const response = await startGameV2(socket, roomCode, sessionToken);
      setIsGameStarted(true);
      setStateVersion(prev => Math.max(prev, response.stateVersion || prev));
      setError(null);
      return;
    }

    if (!roomId) {
      const message = 'Room not found';
      setError(message);
      return Promise.reject(new Error(message));
    }

    return new Promise((resolve, reject) => {
      socket.emit('start-game', roomId, (response: StartGameResponseV1) => {
        if (response.success) {
          setIsGameStarted(true);
          setError(null);
          resolve();
        } else {
          const message = response.error || 'Failed to start game';
          setError(message);
          reject(new Error(message));
        }
      });
    });
  };

  const updatePlayerColor = async (color: string): Promise<void> => {
    if (!socket || !isConnected) {
      const message = 'Socket not connected';
      setError(message);
      return Promise.reject(new Error(message));
    }

    if (!roomCode || !playerId) {
      const message = 'Room data not available';
      setError(message);
      return Promise.reject(new Error(message));
    }

    if (ENABLE_PROTOCOL_V2) {
      if (!sessionToken) {
        const message = 'Session token missing. Please rejoin the room.';
        setError(message);
        return Promise.reject(new Error(message));
      }

      await updatePlayerColorV2(socket, roomCode, sessionToken, color);
      setPlayers(prev =>
        prev.map(player =>
          player.id === playerId
            ? { ...player, color }
            : player
        )
      );
      setError(null);
      return;
    }

    return new Promise((resolve, reject) => {
      if (!roomId) {
        const message = 'Room data not available';
        setError(message);
        reject(new Error(message));
        return;
      }

      socket.emit(
        'update-player-color',
        {
          roomId,
          playerId,
          color
        },
        (response: UpdateColorResponseV1) => {
          if (!response.success) {
            const message = response.error || 'Failed to update player color';
            setError(message);
            reject(new Error(message));
            return;
          }

          setPlayers(prev =>
            prev.map(player =>
              player.id === playerId
                ? { ...player, color }
                : player
            )
          );
          setError(null);
          resolve();
        }
      );
    });
  };

  const submitAction = useCallback(async (baseVersion: number, action: GameActionV2): Promise<void> => {
    if (!ENABLE_PROTOCOL_V2) {
      throw new Error('V2 protocol is disabled.');
    }

    if (!socket || !roomCode || !sessionToken) {
      throw new Error('Missing multiplayer session context.');
    }

    const response = await submitActionV2(socket, roomCode, sessionToken, baseVersion, action);
    setStateVersion(prev => Math.max(prev, response.stateVersion || prev));
  }, [socket, roomCode, sessionToken]);

  const requestSync = useCallback(async (): Promise<void> => {
    if (!ENABLE_PROTOCOL_V2) {
      return;
    }

    if (!socket || !roomCode || !sessionToken) {
      throw new Error('Missing multiplayer session context.');
    }

    const response = await requestSyncV2(socket, roomCode, sessionToken);
    setStateVersion(prev => Math.max(prev, response.stateVersion || prev));
  }, [socket, roomCode, sessionToken]);

  const leaveRoom = () => {
    if (socket && roomCode && sessionToken && ENABLE_PROTOCOL_V2) {
      leaveRoomV2(socket, roomCode, sessionToken).catch(error => {
        console.warn('Failed to notify leave-room-v2:', error.message);
      });
    } else if (socket && roomId && ENABLE_PROTOCOL_V1) {
      socket.emit('leave-room', roomId);
    }

    clearStoredSession(roomCode);
    setIsOnlineMode(false);
    setRoomId(null);
    setRoomCode(null);
    setPlayerId(null);
    setSessionToken(null);
    setPlayers([]);
    setPlayersPresence({});
    setIsHost(false);
    setIsGameStarted(false);
    setIsRejoining(false);
    setStateVersion(0);
    setError(null);
  };

  const contextValue: MultiplayerContextType = {
    isOnlineMode,
    isHost,
    roomId,
    roomCode,
    playerId,
    sessionToken,
    players,
    playersPresence,
    isGameStarted,
    isRejoining,
    stateVersion,
    error,
    socket,
    setOnlineMode: setIsOnlineMode,
    createRoom,
    joinRoom,
    startGame,
    updatePlayerColor,
    submitAction,
    requestSync,
    leaveRoom,
    clearError
  };

  return (
    <MultiplayerContext.Provider value={contextValue}>
      {children}
    </MultiplayerContext.Provider>
  );
};

// Custom hook to use the multiplayer context
export const useMultiplayer = () => useContext(MultiplayerContext);
