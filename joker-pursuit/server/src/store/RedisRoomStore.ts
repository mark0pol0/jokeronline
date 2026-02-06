import { PlayerSession, RoomStateV2 } from '../types/v2';
import { RoomStore, StoreOptions } from './RoomStore';

interface RedisLikeClient {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  expire: (key: string, ttlSeconds: number) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

export class RedisRoomStore implements RoomStore {
  private connected = false;

  constructor(
    private readonly client: RedisLikeClient,
    private readonly options: StoreOptions
  ) {}

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.client.connect();
    this.connected = true;
  }

  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.disconnect();
    this.connected = false;
  }

  private roomKey(code: string): string {
    return `jp:room:${code.toUpperCase()}`;
  }

  private sessionKey(token: string): string {
    return `jp:session:${token}`;
  }

  private ttlSeconds(ms: number): number {
    return Math.max(1, Math.floor(ms / 1000));
  }

  async getRoomByCode(code: string): Promise<RoomStateV2 | null> {
    const key = this.roomKey(code);
    const raw = await this.client.get(key);

    if (!raw) {
      return null;
    }

    await this.client.expire(key, this.ttlSeconds(this.options.roomTtlMs));
    return JSON.parse(raw) as RoomStateV2;
  }

  async saveRoom(room: RoomStateV2): Promise<void> {
    const key = this.roomKey(room.code);
    await this.client.set(key, JSON.stringify(room));
    await this.client.expire(key, this.ttlSeconds(this.options.roomTtlMs));
  }

  async deleteRoom(code: string): Promise<void> {
    await this.client.del(this.roomKey(code));
  }

  async getSession(token: string): Promise<PlayerSession | null> {
    const key = this.sessionKey(token);
    const raw = await this.client.get(key);

    if (!raw) {
      return null;
    }

    await this.client.expire(key, this.ttlSeconds(this.options.sessionTtlMs));
    return JSON.parse(raw) as PlayerSession;
  }

  async saveSession(session: PlayerSession): Promise<void> {
    const key = this.sessionKey(session.token);
    await this.client.set(key, JSON.stringify(session));
    await this.client.expire(key, this.ttlSeconds(this.options.sessionTtlMs));
  }

  async deleteSession(token: string): Promise<void> {
    await this.client.del(this.sessionKey(token));
  }
}
