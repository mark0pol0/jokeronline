"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisRoomStore = void 0;
class RedisRoomStore {
    constructor(client, options) {
        this.client = client;
        this.options = options;
        this.connected = false;
    }
    async connect() {
        if (this.connected) {
            return;
        }
        await this.client.connect();
        this.connected = true;
    }
    async close() {
        if (!this.connected) {
            return;
        }
        await this.client.disconnect();
        this.connected = false;
    }
    roomKey(code) {
        return `jp:room:${code.toUpperCase()}`;
    }
    sessionKey(token) {
        return `jp:session:${token}`;
    }
    ttlSeconds(ms) {
        return Math.max(1, Math.floor(ms / 1000));
    }
    async getRoomByCode(code) {
        const key = this.roomKey(code);
        const raw = await this.client.get(key);
        if (!raw) {
            return null;
        }
        await this.client.expire(key, this.ttlSeconds(this.options.roomTtlMs));
        return JSON.parse(raw);
    }
    async saveRoom(room) {
        const key = this.roomKey(room.code);
        await this.client.set(key, JSON.stringify(room));
        await this.client.expire(key, this.ttlSeconds(this.options.roomTtlMs));
    }
    async deleteRoom(code) {
        await this.client.del(this.roomKey(code));
    }
    async getSession(token) {
        const key = this.sessionKey(token);
        const raw = await this.client.get(key);
        if (!raw) {
            return null;
        }
        await this.client.expire(key, this.ttlSeconds(this.options.sessionTtlMs));
        return JSON.parse(raw);
    }
    async saveSession(session) {
        const key = this.sessionKey(session.token);
        await this.client.set(key, JSON.stringify(session));
        await this.client.expire(key, this.ttlSeconds(this.options.sessionTtlMs));
    }
    async deleteSession(token) {
        await this.client.del(this.sessionKey(token));
    }
}
exports.RedisRoomStore = RedisRoomStore;
