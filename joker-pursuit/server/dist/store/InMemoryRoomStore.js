"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryRoomStore = void 0;
class InMemoryRoomStore {
    constructor(options) {
        this.options = options;
        this.roomsByCode = new Map();
        this.sessionsByToken = new Map();
    }
    now() {
        return Date.now();
    }
    cloneRoom(room) {
        return JSON.parse(JSON.stringify(room));
    }
    cloneSession(session) {
        return JSON.parse(JSON.stringify(session));
    }
    ensureRoomNotExpired(code) {
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
    ensureSessionNotExpired(token) {
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
    async getRoomByCode(code) {
        const normalized = code.toUpperCase();
        const entry = this.ensureRoomNotExpired(normalized);
        if (!entry) {
            return null;
        }
        entry.expiresAt = this.now() + this.options.roomTtlMs;
        this.roomsByCode.set(normalized, entry);
        return this.cloneRoom(entry.room);
    }
    async saveRoom(room) {
        const normalized = room.code.toUpperCase();
        this.roomsByCode.set(normalized, {
            room: this.cloneRoom(room),
            expiresAt: this.now() + this.options.roomTtlMs
        });
    }
    async deleteRoom(code) {
        this.roomsByCode.delete(code.toUpperCase());
    }
    async getSession(token) {
        const entry = this.ensureSessionNotExpired(token);
        if (!entry) {
            return null;
        }
        entry.expiresAt = this.now() + this.options.sessionTtlMs;
        this.sessionsByToken.set(token, entry);
        return this.cloneSession(entry.session);
    }
    async saveSession(session) {
        this.sessionsByToken.set(session.token, {
            session: this.cloneSession(session),
            expiresAt: this.now() + this.options.sessionTtlMs
        });
    }
    async deleteSession(token) {
        this.sessionsByToken.delete(token);
    }
}
exports.InMemoryRoomStore = InMemoryRoomStore;
