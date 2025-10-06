import path from 'path';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors, { CorsOptions } from 'cors';
import { loadEnvFile } from './utils/env';
import { registerGameServer } from './gameServer';

const envPath = path.resolve(__dirname, '..', '.env');
loadEnvFile(envPath);

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

const corsOptions: CorsOptions = {
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

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Joker Pursuit Game Server is running!');
});

const server = http.createServer(app);

const socketPath = process.env.SOCKET_IO_PATH ?? '/api/socket';

const io = new Server(server, {
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

registerGameServer(io);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Socket.IO path ${socketPath}`);
});
