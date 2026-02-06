export type PresenceStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface RoomPlayerV2 {
  id: string;
  name: string;
  color: string;
  sessionToken: string;
  socketId: string | null;
  connected: boolean;
  disconnectedAt?: number;
}

export interface PlayerSession {
  token: string;
  roomCode: string;
  playerId: string;
  lastSeenAt: number;
}

export interface PlayerPresence {
  playerId: string;
  status: PresenceStatus;
  connected: boolean;
  disconnectedAt?: number;
  graceExpiresAt?: number;
}

export interface RoomStateV2 {
  id: string;
  code: string;
  hostPlayerId: string;
  players: RoomPlayerV2[];
  gameState: any;
  isStarted: boolean;
  stateVersion: number;
  createdAt: number;
  updatedAt: number;
}

export type GameActionV2 =
  | {
      type: 'play_move';
      nextGameState: any;
    }
  | {
      type: 'discard_hand';
      nextGameState: any;
    }
  | {
      type: 'skip_second_move';
      nextGameState: any;
    }
  | {
      type: 'phase_transition';
      phase: 'setup' | 'colorSelection' | 'shuffling' | 'playing';
      nextGameState?: any;
    };

export interface ActionResult {
  success: boolean;
  reason?: string;
  room: RoomStateV2;
}

export interface RoomSnapshotV2 {
  roomCode: string;
  roomId: string;
  stateVersion: number;
  gameState: any;
  players: Array<{ id: string; name: string; color: string }>;
  playersPresence: Record<string, PlayerPresence>;
  hostPlayerId: string;
  selfPlayerId?: string;
  isStarted: boolean;
}
