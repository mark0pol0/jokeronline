import { PlayerSession, RoomStateV2 } from '../types/v2';
import { RoomStore, StoreOptions } from './RoomStore';

interface RoomEntry {
  room: RoomStateV2;
  expiresAt: number;
}

interface SessionEntry {
  session: PlayerSession;
  expiresAt: number;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly roomsByCode = new Map<string, RoomEntry>();
  private readonly sessionsByToken = new Map<string, SessionEntry>();

  constructor(private readonly options: StoreOptions) {}

  private now(): number {
    return Date.now();
  }

  private cloneRoom(room: RoomStateV2): RoomStateV2 {
    return JSON.parse(JSON.stringify(room)) as RoomStateV2;
  }

  private cloneSession(session: PlayerSession): PlayerSession {
    return JSON.parse(JSON.stringify(session)) as PlayerSession;
  }

  private ensureRoomNotExpired(code: string): RoomEntry | null {
    const entry = this.roomsByCode.get(code.toUpperCase());
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= this.now()) {
      this.roomsByCode.delete(code.toUpperCase());
      return null;
    }

    return entry;
  }

  private ensureSessionNotExpired(token: string): SessionEntry | null {
    const entry = this.sessionsByToken.get(token);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= this.now()) {
      this.sessionsByToken.delete(token);
      return null;
    }

    return entry;
  }

  async getRoomByCode(code: string): Promise<RoomStateV2 | null> {
    const normalized = code.toUpperCase();
    const entry = this.ensureRoomNotExpired(normalized);
    if (!entry) {
      return null;
    }

    entry.expiresAt = this.now() + this.options.roomTtlMs;
    this.roomsByCode.set(normalized, entry);
    return this.cloneRoom(entry.room);
  }

  async saveRoom(room: RoomStateV2): Promise<void> {
    const normalized = room.code.toUpperCase();
    this.roomsByCode.set(normalized, {
      room: this.cloneRoom(room),
      expiresAt: this.now() + this.options.roomTtlMs
    });
  }

  async deleteRoom(code: string): Promise<void> {
    this.roomsByCode.delete(code.toUpperCase());
  }

  async getSession(token: string): Promise<PlayerSession | null> {
    const entry = this.ensureSessionNotExpired(token);
    if (!entry) {
      return null;
    }

    entry.expiresAt = this.now() + this.options.sessionTtlMs;
    this.sessionsByToken.set(token, entry);
    return this.cloneSession(entry.session);
  }

  async saveSession(session: PlayerSession): Promise<void> {
    this.sessionsByToken.set(session.token, {
      session: this.cloneSession(session),
      expiresAt: this.now() + this.options.sessionTtlMs
    });
  }

  async deleteSession(token: string): Promise<void> {
    this.sessionsByToken.delete(token);
  }
}
