"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./utils/env");
const gameServer_1 = require("./gameServer");
const envPath = path_1.default.resolve(__dirname, '..', '.env');
(0, env_1.loadEnvFile)(envPath);
const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://localhost:5173'
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const effectiveOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;
const allowsAllOrigins = effectiveOrigins.includes('*');
const corsOptions = {
    origin: (origin, callback) => {
        if (allowsAllOrigins || !origin || effectiveOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST'],
    credentials: true
};
console.log('CORS allowed origins:', effectiveOrigins);
const app = (0, express_1.default)();
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.get('/', (_req, res) => {
    res.send('Joker Pursuit Game Server is running!');
});
const server = http_1.default.createServer(app);
const socketPath = process.env.SOCKET_IO_PATH ?? '/api/socket';
const io = new socket_io_1.Server(server, {
    path: socketPath,
    cors: {
        origin: (origin, callback) => {
            if (allowsAllOrigins || !origin || effectiveOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`Origin ${origin} not allowed by Socket.IO CORS`));
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});
(0, gameServer_1.registerGameServer)(io);
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with Socket.IO path ${socketPath}`);
});
