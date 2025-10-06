import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from 'socket.io';
import { registerGameServer } from '../joker-pursuit/server/src/gameServer';

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

const socketPath = process.env.SOCKET_IO_PATH ?? '/api/socket';

const ensureSocketServer = (res: VercelResponse) => {
  const server = res.socket?.server as any;
  if (!server) {
    throw new Error('Socket server is not available on the response object.');
  }

  if (!server.io) {
    const io = new Server(server, {
      path: socketPath,
      cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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
    server.io = io;
    console.log('Socket.IO server initialised via Vercel function');
  }

  return server.io as Server;
};

export default function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    ensureSocketServer(res);
    res.end();
  } catch (error) {
    console.error('Failed to initialise Socket.IO server', error);
    res.status(500).send('Socket initialisation failed');
  }
}

export const config = {
  api: {
    bodyParser: false
  },
  supportsResponseStreaming: true
};
