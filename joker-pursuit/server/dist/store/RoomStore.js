"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoomStore = exports.DEFAULT_STORE_OPTIONS = void 0;
const InMemoryRoomStore_1 = require("./InMemoryRoomStore");
const RedisRoomStore_1 = require("./RedisRoomStore");
const HOURS = 60 * 60 * 1000;
exports.DEFAULT_STORE_OPTIONS = {
    roomTtlMs: Number(process.env.ROOM_TTL_HOURS || 24) * HOURS,
    sessionTtlMs: Number(process.env.ROOM_TTL_HOURS || 24) * HOURS
};
const createRoomStore = async (options = exports.DEFAULT_STORE_OPTIONS) => {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
        console.log('[store] REDIS_URL not set. Using in-memory room store.');
        return new InMemoryRoomStore_1.InMemoryRoomStore(options);
    }
    try {
        // Lazy runtime import so local dev can run without redis installed.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const redisModule = require('redis');
        const client = redisModule.createClient({ url: redisUrl });
        const redisStore = new RedisRoomStore_1.RedisRoomStore(client, options);
        await redisStore.connect();
        console.log('[store] Using Redis room store.');
        return redisStore;
    }
    catch (error) {
        console.error('[store] Failed to initialize Redis. Falling back to in-memory store.', error);
        return new InMemoryRoomStore_1.InMemoryRoomStore(options);
    }
};
exports.createRoomStore = createRoomStore;
