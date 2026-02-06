import socketIOClient from 'socket.io-client';
import { GameState } from '../models/GameState';

export type MultiplayerPhase = 'setup' | 'colorSelection' | 'shuffling' | 'playing';

export interface PlayerPresence {
  playerId: string;
  status: 'connected' | 'reconnecting' | 'disconnected';
  connected: boolean;
  disconnectedAt?: number;
  graceExpiresAt?: number;
}

export interface RoomSnapshotV2 {
  roomCode: string;
  roomId: string;
  stateVersion: number;
  gameState: GameState | null;
  players: Array<{ id: string; name: string; color: string }>;
  playersPresence: Record<string, PlayerPresence>;
  hostPlayerId?: string;
  selfPlayerId?: string;
  isStarted: boolean;
}

export type GameActionV2 =
  | {
      type: 'play_move';
      nextGameState: GameState;
    }
  | {
      type: 'discard_hand';
      nextGameState: GameState;
    }
  | {
      type: 'skip_second_move';
      nextGameState: GameState;
    }
  | {
      type: 'phase_transition';
      phase: MultiplayerPhase;
      nextGameState?: GameState;
    };

interface AckResponse {
  success: boolean;
  error?: string;
  [key: string]: any;
}

interface CreateJoinResponse extends AckResponse {
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  sessionToken?: string;
  players?: Array<{ id: string; name: string; color: string }>;
  stateVersion?: number;
  isHost?: boolean;
  isGameStarted?: boolean;
}

interface StartGameResponse extends AckResponse {
  stateVersion?: number;
}

interface SubmitActionResponse extends AckResponse {
  stateVersion?: number;
  expectedVersion?: number;
}

interface SyncResponse extends AckResponse {
  stateVersion?: number;
}

type SocketType = ReturnType<typeof socketIOClient>;

const ACK_TIMEOUT_MS = 15000;

const emitWithAck = <T extends AckResponse>(
  socket: SocketType,
  event: string,
  payload: any
): Promise<T> => {
  return new Promise((resolve, reject) => {
    let didTimeout = false;

    const timeout = window.setTimeout(() => {
      didTimeout = true;
      reject(new Error(`Timed out waiting for ${event} response.`));
    }, ACK_TIMEOUT_MS);

    socket.emit(event, payload, (response: T) => {
      if (didTimeout) {
        return;
      }

      window.clearTimeout(timeout);

      if (!response?.success) {
        reject(new Error(response?.error || `${event} failed.`));
        return;
      }

      resolve(response);
    });
  });
};

export const createRoomV2 = async (
  socket: SocketType,
  playerName: string
): Promise<CreateJoinResponse> => {
  return emitWithAck<CreateJoinResponse>(socket, 'create-room-v2', { playerName });
};

export const joinRoomV2 = async (
  socket: SocketType,
  roomCode: string,
  playerName: string
): Promise<CreateJoinResponse> => {
  return emitWithAck<CreateJoinResponse>(socket, 'join-room-v2', {
    roomCode: roomCode.toUpperCase(),
    playerName
  });
};

export const rejoinRoomV2 = async (
  socket: SocketType,
  roomCode: string,
  sessionToken: string
): Promise<CreateJoinResponse> => {
  return emitWithAck<CreateJoinResponse>(socket, 'rejoin-room-v2', {
    roomCode: roomCode.toUpperCase(),
    sessionToken
  });
};

export const startGameV2 = async (
  socket: SocketType,
  roomCode: string,
  sessionToken: string
): Promise<StartGameResponse> => {
  return emitWithAck<StartGameResponse>(socket, 'start-game-v2', {
    roomCode: roomCode.toUpperCase(),
    sessionToken
  });
};

export const updatePlayerColorV2 = async (
  socket: SocketType,
  roomCode: string,
  sessionToken: string,
  color: string
): Promise<AckResponse> => {
  return emitWithAck<AckResponse>(socket, 'update-player-color-v2', {
    roomCode: roomCode.toUpperCase(),
    sessionToken,
    color
  });
};

export const submitActionV2 = async (
  socket: SocketType,
  roomCode: string,
  sessionToken: string,
  baseVersion: number,
  action: GameActionV2
): Promise<SubmitActionResponse> => {
  return emitWithAck<SubmitActionResponse>(socket, 'submit-action-v2', {
    roomCode: roomCode.toUpperCase(),
    sessionToken,
    baseVersion,
    action
  });
};

export const requestSyncV2 = async (
  socket: SocketType,
  roomCode: string,
  sessionToken: string
): Promise<SyncResponse> => {
  return emitWithAck<SyncResponse>(socket, 'request-sync-v2', {
    roomCode: roomCode.toUpperCase(),
    sessionToken
  });
};

export const leaveRoomV2 = async (
  socket: SocketType,
  roomCode: string,
  sessionToken: string
): Promise<AckResponse> => {
  return emitWithAck<AckResponse>(socket, 'leave-room-v2', {
    roomCode: roomCode.toUpperCase(),
    sessionToken
  });
};
