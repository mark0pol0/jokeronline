import { InMemoryRoomStore } from './InMemoryRoomStore';
import { RedisRoomStore } from './RedisRoomStore';
import { PlayerSession, RoomStateV2 } from '../types/v2';

export interface StoreOptions {
  roomTtlMs: number;
  sessionTtlMs: number;
}

export interface RoomStore {
  getRoomByCode(code: string): Promise<RoomStateV2 | null>;
  saveRoom(room: RoomStateV2): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  getSession(token: string): Promise<PlayerSession | null>;
  saveSession(session: PlayerSession): Promise<void>;
  deleteSession(token: string): Promise<void>;
  close?(): Promise<void>;
}

const HOURS = 60 * 60 * 1000;

export const DEFAULT_STORE_OPTIONS: StoreOptions = {
  roomTtlMs: Number(process.env.ROOM_TTL_HOURS || 24) * HOURS,
  sessionTtlMs: Number(process.env.ROOM_TTL_HOURS || 24) * HOURS
};

export const createRoomStore = async (
  options: StoreOptions = DEFAULT_STORE_OPTIONS
): Promise<RoomStore> => {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    console.log('[store] REDIS_URL not set. Using in-memory room store.');
    return new InMemoryRoomStore(options);
  }

  try {
    // Lazy runtime import so local dev can run without redis installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const redisModule = require('redis');
    const client = redisModule.createClient({ url: redisUrl });
    const redisStore = new RedisRoomStore(client, options);
    await redisStore.connect();
    console.log('[store] Using Redis room store.');
    return redisStore;
  } catch (error) {
    console.error('[store] Failed to initialize Redis. Falling back to in-memory store.', error);
    return new InMemoryRoomStore(options);
  }
};
