import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { randomBytes } from 'crypto';
import { ActionProcessor } from './game/ActionProcessor';
import { createRoomStore } from './store/RoomStore';
import {
  GameActionV2,
  PlayerPresence,
  PlayerSession,
  RoomPlayerV2,
  RoomSnapshotV2,
  RoomStateV2
} from './types/v2';

// Types for our game state
interface LegacyPlayer {
  id: string;
  name: string;
  color: string;
  socketId: string;
}

interface LegacyRoom {
  id: string;
  code: string;
  host: string; // socketId of host
  players: LegacyPlayer[];
  gameState: any; // We'll use the same gameState structure as the client
  isGameStarted: boolean;
}

type Player = LegacyPlayer;
type Room = LegacyRoom;

// Helper to serialize players for client responses
function serializePlayers(players: LegacyPlayer[]) {
  return players.map(p => ({ id: p.id, name: p.name, color: p.color }));
}

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Add a simple endpoint for testing
app.get('/', (req, res) => {
  res.send('Joker Pursuit Game Server is running!');
});

// Lightweight health check endpoint for hosting platforms
app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true });
});

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server with simplified options
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins in development
    methods: ['GET', 'POST'],
    credentials: false
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const ENABLE_PROTOCOL_V2 = process.env.ENABLE_PROTOCOL_V2 !== 'false';
const ENABLE_PROTOCOL_V1 = process.env.ENABLE_PROTOCOL_V1 !== 'false';
const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MINUTES || 30) * 60 * 1000;

// Store active game rooms for legacy V1 protocol
const rooms = new Map<string, LegacyRoom>();

// Shared V2 primitives
const roomStorePromise = createRoomStore();
const actionProcessor = new ActionProcessor();
const socketSessions = new Map<string, { roomCode: string; playerId: string; sessionToken: string }>();

function getNow(): number {
  return Date.now();
}

function generateRoomCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

function generatePlayerId(): string {
  return `player-${Date.now()}-${randomBytes(2).toString('hex')}`;
}

function generateSessionToken(): string {
  return randomBytes(24).toString('hex');
}

function serializeV2Players(players: RoomPlayerV2[]) {
  return players.map(player => ({
    id: player.id,
    name: player.name,
    color: player.color
  }));
}

function getPlayerPresence(player: RoomPlayerV2): PlayerPresence {
  if (player.connected) {
    return {
      playerId: player.id,
      status: 'connected',
      connected: true
    };
  }

  if (!player.disconnectedAt) {
    return {
      playerId: player.id,
      status: 'disconnected',
      connected: false
    };
  }

  const graceExpiresAt = player.disconnectedAt + DISCONNECT_GRACE_MS;
  const isStillInGrace = getNow() <= graceExpiresAt;

  return {
    playerId: player.id,
    status: isStillInGrace ? 'reconnecting' : 'disconnected',
    connected: false,
    disconnectedAt: player.disconnectedAt,
    graceExpiresAt
  };
}

function getPresenceMap(room: RoomStateV2): Record<string, PlayerPresence> {
  return room.players.reduce((acc, player) => {
    acc[player.id] = getPlayerPresence(player);
    return acc;
  }, {} as Record<string, PlayerPresence>);
}

function buildSnapshot(room: RoomStateV2, selfPlayerId?: string): RoomSnapshotV2 {
  return {
    roomCode: room.code,
    roomId: room.id,
    stateVersion: room.stateVersion,
    gameState: room.gameState,
    players: serializeV2Players(room.players),
    playersPresence: getPresenceMap(room),
    hostPlayerId: room.hostPlayerId,
    selfPlayerId,
    isStarted: room.isStarted
  };
}

function isSessionForRoom(session: PlayerSession, roomCode: string): boolean {
  return session.roomCode.toUpperCase() === roomCode.toUpperCase();
}

function setSocketSession(socketId: string, session: { roomCode: string; playerId: string; sessionToken: string }) {
  socketSessions.set(socketId, session);
}

function clearSocketSession(socketId: string) {
  socketSessions.delete(socketId);
}

function pruneExpiredDisconnectedPlayers(room: RoomStateV2): RoomStateV2 {
  const cutoff = getNow() - DISCONNECT_GRACE_MS;
  const beforeCount = room.players.length;
  room.players = room.players.filter(player => {
    if (player.connected) {
      return true;
    }

    if (!player.disconnectedAt) {
      return false;
    }

    return player.disconnectedAt > cutoff;
  });

  if (beforeCount !== room.players.length) {
    room.updatedAt = getNow();
    if (!room.players.find(player => player.id === room.hostPlayerId) && room.players.length > 0) {
      room.hostPlayerId = room.players[0].id;
    }
  }

  return room;
}

async function emitPresenceUpdate(room: RoomStateV2) {
  io.to(room.id).emit('presence-updated-v2', {
    roomCode: room.code,
    playersPresence: getPresenceMap(room)
  });
}

async function emitHostUpdate(room: RoomStateV2) {
  io.to(room.id).emit('host-updated-v2', {
    roomCode: room.code,
    hostPlayerId: room.hostPlayerId
  });
}

async function emitSnapshot(room: RoomStateV2) {
  room.players.forEach(player => {
    if (player.connected && player.socketId) {
      io.to(player.socketId).emit('room-snapshot-v2', buildSnapshot(room, player.id));
    }
  });
}

async function sendRejected(
  socketId: string,
  reason: string,
  expectedVersion: number,
  room: RoomStateV2,
  selfPlayerId?: string
) {
  io.to(socketId).emit('action-rejected-v2', {
    reason,
    expectedVersion,
    snapshot: buildSnapshot(room, selfPlayerId)
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Debug connection event
  socket.emit('debug', { message: 'You are connected to the server!' });

  if (ENABLE_PROTOCOL_V2) {
    socket.on('create-room-v2', async (data: { playerName: string }, callback) => {
      try {
        const playerName = data?.playerName?.trim();
        if (!playerName) {
          callback({ success: false, error: 'Player name is required.' });
          return;
        }

        const store = await roomStorePromise;
        const roomCode = generateRoomCode();
        const roomId = `room_${Date.now()}`;
        const playerId = generatePlayerId();
        const sessionToken = generateSessionToken();
        const now = getNow();

        const room: RoomStateV2 = {
          id: roomId,
          code: roomCode,
          hostPlayerId: playerId,
          players: [
            {
              id: playerId,
              name: playerName,
              color: '',
              sessionToken,
              socketId: socket.id,
              connected: true
            }
          ],
          gameState: null,
          isStarted: false,
          stateVersion: 1,
          createdAt: now,
          updatedAt: now
        };

        const session: PlayerSession = {
          token: sessionToken,
          roomCode,
          playerId,
          lastSeenAt: now
        };

        await store.saveRoom(room);
        await store.saveSession(session);

        setSocketSession(socket.id, { roomCode, playerId, sessionToken });
        socket.join(roomId);

        callback({
          success: true,
          roomId,
          roomCode,
          playerId,
          sessionToken,
          players: serializeV2Players(room.players),
          isHost: true,
          stateVersion: room.stateVersion
        });

        io.to(room.id).emit('player-joined-v2', {
          roomCode: room.code,
          players: serializeV2Players(room.players),
          hostPlayerId: room.hostPlayerId
        });
        await emitPresenceUpdate(room);
      } catch (error) {
        console.error('create-room-v2 failed', error);
        callback({ success: false, error: 'Failed to create room.' });
      }
    });

    socket.on('join-room-v2', async (data: { roomCode: string; playerName: string }, callback) => {
      try {
        const roomCode = data?.roomCode?.trim()?.toUpperCase();
        const playerName = data?.playerName?.trim();

        if (!roomCode || !playerName) {
          callback({ success: false, error: 'Room code and player name are required.' });
          return;
        }

        const store = await roomStorePromise;
        const room = await store.getRoomByCode(roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found.' });
          return;
        }

        pruneExpiredDisconnectedPlayers(room);

        if (room.isStarted) {
          callback({
            success: false,
            error: 'Game already started. Mid-game join is disabled (rejoin only).'
          });
          return;
        }

        if (room.players.length >= 8) {
          callback({ success: false, error: 'Room is full.' });
          return;
        }

        const playerId = generatePlayerId();
        const sessionToken = generateSessionToken();
        const now = getNow();

        room.players.push({
          id: playerId,
          name: playerName,
          color: '',
          sessionToken,
          socketId: socket.id,
          connected: true
        });
        room.updatedAt = now;

        await store.saveRoom(room);
        await store.saveSession({
          token: sessionToken,
          roomCode: room.code,
          playerId,
          lastSeenAt: now
        });

        setSocketSession(socket.id, { roomCode: room.code, playerId, sessionToken });
        socket.join(room.id);

        callback({
          success: true,
          roomId: room.id,
          roomCode: room.code,
          playerId,
          sessionToken,
          players: serializeV2Players(room.players),
          isHost: room.hostPlayerId === playerId,
          stateVersion: room.stateVersion
        });

        io.to(room.id).emit('player-joined-v2', {
          roomCode: room.code,
          players: serializeV2Players(room.players),
          hostPlayerId: room.hostPlayerId
        });
        await emitPresenceUpdate(room);
      } catch (error) {
        console.error('join-room-v2 failed', error);
        callback({ success: false, error: 'Failed to join room.' });
      }
    });

    socket.on('rejoin-room-v2', async (data: { roomCode: string; sessionToken: string }, callback) => {
      try {
        const roomCode = data?.roomCode?.trim()?.toUpperCase();
        const sessionToken = data?.sessionToken?.trim();

        if (!roomCode || !sessionToken) {
          callback({ success: false, error: 'Missing rejoin token or room code.' });
          return;
        }

        const store = await roomStorePromise;
        const session = await store.getSession(sessionToken);
        if (!session || session.roomCode.toUpperCase() !== roomCode) {
          callback({ success: false, error: 'Session expired. Rejoin only if lobby not started.' });
          return;
        }

        const room = await store.getRoomByCode(roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found.' });
          return;
        }

        pruneExpiredDisconnectedPlayers(room);

        const player = room.players.find(entry => entry.id === session.playerId);
        if (!player) {
          callback({ success: false, error: 'Seat no longer available.' });
          return;
        }

        if (player.disconnectedAt && getNow() - player.disconnectedAt > DISCONNECT_GRACE_MS) {
          callback({ success: false, error: 'Reconnect grace period expired.' });
          return;
        }

        player.connected = true;
        player.socketId = socket.id;
        delete player.disconnectedAt;
        room.updatedAt = getNow();

        await store.saveSession({
          ...session,
          lastSeenAt: getNow()
        });
        await store.saveRoom(room);

        setSocketSession(socket.id, {
          roomCode: room.code,
          playerId: player.id,
          sessionToken
        });
        socket.join(room.id);

        callback({
          success: true,
          roomId: room.id,
          roomCode: room.code,
          playerId: player.id,
          sessionToken,
          players: serializeV2Players(room.players),
          isHost: room.hostPlayerId === player.id,
          isGameStarted: room.isStarted,
          stateVersion: room.stateVersion
        });

        await emitPresenceUpdate(room);
        await emitSnapshot(room);
      } catch (error) {
        console.error('rejoin-room-v2 failed', error);
        callback({ success: false, error: 'Failed to rejoin room.' });
      }
    });

    socket.on('start-game-v2', async (data: { roomCode: string; sessionToken: string }, callback) => {
      try {
        const roomCode = data?.roomCode?.trim()?.toUpperCase();
        const sessionToken = data?.sessionToken?.trim();
        if (!roomCode || !sessionToken) {
          callback({ success: false, error: 'Missing room information.' });
          return;
        }

        const store = await roomStorePromise;
        const session = await store.getSession(sessionToken);
        const room = roomCode ? await store.getRoomByCode(roomCode) : null;
        if (
          !session ||
          !room ||
          !isSessionForRoom(session, room.code) ||
          session.playerId !== room.hostPlayerId
        ) {
          callback({ success: false, error: 'Only host can start the game.' });
          return;
        }

        const hostPlayer = room.players.find(entry => entry.id === session.playerId);
        if (!hostPlayer || !hostPlayer.connected || hostPlayer.socketId !== socket.id) {
          callback({ success: false, error: 'Session is not bound to this connection.' });
          return;
        }

        room.isStarted = true;
        room.updatedAt = getNow();
        await store.saveRoom(room);

        io.to(room.id).emit('game-started-v2', {
          roomCode: room.code,
          players: serializeV2Players(room.players),
          hostPlayerId: room.hostPlayerId
        });
        await emitPresenceUpdate(room);

        callback({ success: true, stateVersion: room.stateVersion });
      } catch (error) {
        console.error('start-game-v2 failed', error);
        callback({ success: false, error: 'Failed to start game.' });
      }
    });

    socket.on(
      'update-player-color-v2',
      async (data: { roomCode: string; sessionToken: string; color: string }, callback) => {
        try {
          const roomCode = data?.roomCode?.trim()?.toUpperCase();
          const sessionToken = data?.sessionToken?.trim();
          const color = data?.color?.trim();
          if (!roomCode || !sessionToken || !color) {
            callback({ success: false, error: 'Invalid color update request.' });
            return;
          }

          const store = await roomStorePromise;
          const session = await store.getSession(sessionToken);
          const room = await store.getRoomByCode(roomCode);
          if (!session || !room || !isSessionForRoom(session, room.code) || session.playerId === undefined) {
            callback({ success: false, error: 'Invalid session.' });
            return;
          }

          const player = room.players.find(entry => entry.id === session.playerId);
          if (!player || !player.connected || player.socketId !== socket.id) {
            callback({ success: false, error: 'Player not found.' });
            return;
          }

          player.color = color;
          if (room.gameState?.players?.length) {
            room.gameState.players = room.gameState.players.map((statePlayer: any) =>
              statePlayer.id === player.id
                ? { ...statePlayer, color }
                : statePlayer
            );
          }
          room.updatedAt = getNow();

          await store.saveRoom(room);

          io.to(room.id).emit('player-color-updated-v2', {
            roomCode: room.code,
            playerId: player.id,
            color
          });
          io.to(room.id).emit('player-joined-v2', {
            roomCode: room.code,
            players: serializeV2Players(room.players)
          });

          callback({ success: true, players: serializeV2Players(room.players) });
        } catch (error) {
          console.error('update-player-color-v2 failed', error);
          callback({ success: false, error: 'Failed to update color.' });
        }
      }
    );

    socket.on(
      'submit-action-v2',
      async (
        data: {
          roomCode: string;
          sessionToken: string;
          baseVersion: number;
          action: GameActionV2;
        },
        callback
      ) => {
        try {
          const roomCode = data?.roomCode?.trim()?.toUpperCase();
          const sessionToken = data?.sessionToken?.trim();
          const baseVersion = Number(data?.baseVersion);
          const action = data?.action;

          if (!roomCode || !sessionToken || !Number.isFinite(baseVersion) || !action) {
            callback({ success: false, error: 'Invalid action payload.' });
            return;
          }

          const store = await roomStorePromise;
          const session = await store.getSession(sessionToken);
          const room = await store.getRoomByCode(roomCode);
          if (!session || !room || !isSessionForRoom(session, room.code) || session.playerId === undefined) {
            callback({ success: false, error: 'Invalid session.' });
            return;
          }

          const player = room.players.find(entry => entry.id === session.playerId);
          if (!player || !player.connected || player.socketId !== socket.id) {
            callback({ success: false, error: 'Session is not bound to this connection.' });
            return;
          }

          const result = actionProcessor.process({
            room,
            actorPlayerId: session.playerId,
            baseVersion,
            action
          });

          if (!result.success) {
            await sendRejected(socket.id, result.reason || 'action_rejected', result.room.stateVersion, result.room, session.playerId);
            callback({
              success: false,
              error: result.reason || 'Action rejected.',
              expectedVersion: result.room.stateVersion
            });
            return;
          }

          await store.saveRoom(result.room);
          await emitSnapshot(result.room);
          await emitPresenceUpdate(result.room);

          callback({
            success: true,
            stateVersion: result.room.stateVersion
          });
        } catch (error) {
          console.error('submit-action-v2 failed', error);
          callback({ success: false, error: 'Failed to submit action.' });
        }
      }
    );

    socket.on('request-sync-v2', async (data: { roomCode: string; sessionToken: string }, callback) => {
      try {
        const roomCode = data?.roomCode?.trim()?.toUpperCase();
        const sessionToken = data?.sessionToken?.trim();
        if (!roomCode || !sessionToken) {
          callback?.({ success: false, error: 'Missing room/session for sync.' });
          return;
        }

        const store = await roomStorePromise;
        const session = await store.getSession(sessionToken);
        const room = await store.getRoomByCode(roomCode);
        if (!session || !room || !isSessionForRoom(session, room.code) || session.playerId === undefined) {
          callback?.({ success: false, error: 'Invalid session.' });
          return;
        }

        const player = room.players.find(entry => entry.id === session.playerId);
        if (!player || !player.connected || player.socketId !== socket.id) {
          callback?.({ success: false, error: 'Session is not bound to this connection.' });
          return;
        }

        io.to(socket.id).emit('room-snapshot-v2', buildSnapshot(room, session.playerId));
        callback?.({ success: true, stateVersion: room.stateVersion });
      } catch (error) {
        console.error('request-sync-v2 failed', error);
        callback?.({ success: false, error: 'Failed to sync game state.' });
      }
    });

    socket.on('leave-room-v2', async (data: { roomCode: string; sessionToken: string }, callback) => {
      try {
        const roomCode = data?.roomCode?.trim()?.toUpperCase();
        const sessionToken = data?.sessionToken?.trim();
        if (!roomCode || !sessionToken) {
          callback?.({ success: false, error: 'Missing room/session.' });
          return;
        }

        const store = await roomStorePromise;
        const session = await store.getSession(sessionToken);
        const room = await store.getRoomByCode(roomCode);
        if (!session || !room || !isSessionForRoom(session, room.code) || session.playerId === undefined) {
          callback?.({ success: false, error: 'Invalid session.' });
          return;
        }

        const boundPlayer = room.players.find(entry => entry.id === session.playerId);
        if (!boundPlayer || boundPlayer.socketId !== socket.id) {
          callback?.({ success: false, error: 'Session is not bound to this connection.' });
          return;
        }

        const previousHostId = room.hostPlayerId;
        let didRemoveSeat = false;

        const playerIndex = room.players.findIndex(entry => entry.id === session.playerId);
        if (playerIndex >= 0) {
          if (room.isStarted) {
            const player = room.players[playerIndex];
            player.connected = false;
            player.socketId = null;
            player.disconnectedAt = getNow();
          } else {
            room.players.splice(playerIndex, 1);
            await store.deleteSession(sessionToken);
            didRemoveSeat = true;
          }
        }

        if (room.players.length > 0 && !room.players.find(entry => entry.id === room.hostPlayerId)) {
          room.hostPlayerId = room.players[0].id;
        }
        room.updatedAt = getNow();

        clearSocketSession(socket.id);
        socket.leave(room.id);

        if (room.players.length === 0) {
          await store.deleteRoom(room.code);
          callback?.({ success: true });
          return;
        }

        await store.saveRoom(room);

        if (didRemoveSeat) {
          io.to(room.id).emit('player-joined-v2', {
            roomCode: room.code,
            players: serializeV2Players(room.players),
            hostPlayerId: room.hostPlayerId
          });
        }
        if (previousHostId !== room.hostPlayerId) {
          await emitHostUpdate(room);
        }
        await emitPresenceUpdate(room);
        callback?.({ success: true });
      } catch (error) {
        console.error('leave-room-v2 failed', error);
        callback?.({ success: false, error: 'Failed to leave room.' });
      }
    });
  }

  if (ENABLE_PROTOCOL_V1) {
  
  // Create a new game room
  socket.on('create-room', (playerName: string, callback) => {
    try {
      console.log(`Creating room for ${playerName}`);
      const roomCode = generateRoomCode();
      const roomId = `room_${Date.now()}`;
      
      // Create new player
      const player: Player = {
        id: `player-${Date.now()}`,
        name: playerName,
        color: '', // Will be set during game setup
        socketId: socket.id
      };
      
      // Create new room
      const room: Room = {
        id: roomId,
        code: roomCode,
        host: socket.id,
        players: [player],
        gameState: null,
        isGameStarted: false
      };
      
      // Store room and join socket room
      rooms.set(roomId, room);
      socket.join(roomId);
      
      console.log(`Room created: ${roomId} with code: ${roomCode}`);
      callback({
        success: true,
        roomId,
        roomCode,
        playerId: player.id,
        players: serializePlayers(room.players)
      });
    } catch (error) {
      console.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });
  
  // Join an existing game room
  socket.on('join-room', (roomCode: string, playerName: string, callback) => {
    try {
      // Check if room code already exists
      const roomId = Array.from(rooms.keys()).find(id => 
        rooms.get(id)?.code.toLowerCase() === roomCode.toLowerCase()
      );

      if (roomId) {
        // Room exists, try to join
        const room = rooms.get(roomId);
        
        if (!room) {
          console.error(`Room ${roomId} not found for joining`);
          return callback({ success: false, error: 'Room not found' });
        }
        
        // Check if game already started
        if (room.isGameStarted) {
          return callback({ 
            success: false, 
            error: 'Game has already started. You cannot join now.' 
          });
        }
        
        // Check if player limit reached (8 players max)
        if (room.players.length >= 8) {
          return callback({ 
            success: false, 
            error: 'Room is full. Maximum 8 players allowed.' 
          });
        }
        
        // Create new player
        const player: Player = {
          id: `player-${Date.now()}`,
          name: playerName,
          color: '', // Will be set during game setup
          socketId: socket.id
        };
        
        // Add player to room
        room.players.push(player);
        socket.join(roomId);
        
        // Notify all players in the room that someone joined
        io.to(roomId).emit('player-joined', {
          players: serializePlayers(room.players)
        });

        callback({
          success: true,
          roomId,
          roomCode: room.code,
          playerId: player.id,
          players: serializePlayers(room.players)
        });
      } else {
        console.error(`Room with code ${roomCode} not found`);
        callback({ success: false, error: 'Room not found' });
      }
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });
  
  // Start game
  socket.on('start-game', (roomId: string, callback) => {
    try {
      const room = rooms.get(roomId);
      
      if (!room) {
        console.error(`Room ${roomId} not found for game start`);
        callback({ success: false, error: 'Room not found' });
        return;
      }
      
      // Check if user is the host
      if (room.host !== socket.id) {
        return callback({ success: false, error: 'Only the host can start the game' });
      }
      
      room.isGameStarted = true;
      
      // Notify all players that game is starting
      io.to(roomId).emit('game-started', {
        players: serializePlayers(room.players)
      });
      
      callback({ success: true });
    } catch (error) {
      console.error('Error starting game:', error);
      callback({ success: false, error: 'Failed to start game' });
    }
  });
  
  // Update player color
  socket.on('update-player-color', (data: { roomId: string, playerId: string, color: string }, callback) => {
    try {
      const { roomId, playerId, color } = data;
      console.log(`Updating player color: ${playerId} to ${color} in room ${roomId}`);
      
      const room = rooms.get(roomId);
      
      if (!room) {
        console.error(`Room ${roomId} not found for color update`);
        callback({ success: false, error: 'Room not found' });
        return;
      }
      
      // Find player and update color
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.color = color;
        
        // Notify all players about the color update
        io.to(roomId).emit('player-color-updated', { playerId, color });
        
        // Return success with updated players array
        callback({
          success: true,
          players: serializePlayers(room.players)
        });
      } else {
        callback({ success: false, error: 'Player not found' });
      }
    } catch (error) {
      console.error('Error updating player color:', error);
      callback({ success: false, error: 'Failed to update player color' });
    }
  });
  
  // Update game state
  socket.on('update-game-state', ({ roomId, gameState }) => {
    try {
      console.log(`Updating game state for room ${roomId}`);
      const room = rooms.get(roomId);
      
      if (room) {
        // Store the updated game state
        room.gameState = gameState;
        
        // Log current player for debugging
        if (gameState.players && gameState.players.length > 0) {
          const currentPlayerIndex = gameState.currentPlayerIndex;
          const currentPlayer = gameState.players[currentPlayerIndex];
          console.log(`Current player after update: ${currentPlayer?.name} (${currentPlayer?.id})`);
        }
        
        // Broadcast to ALL players in the room (including sender)
        console.log(`Broadcasting game state update to all players in room ${roomId}`);
        io.to(roomId).emit('game-state-updated', gameState);
      } else {
        console.error(`Room ${roomId} not found for game state update`);
      }
    } catch (error) {
      console.error('Error updating game state:', error);
    }
  });
  
  // Handle shuffle cards request (host only)
  socket.on('shuffle-cards', ({ roomId, deckState }) => {
    try {
      console.log(`Shuffling cards for room ${roomId}`);
      const room = rooms.get(roomId);

      if (!room) {
        console.error(`Room ${roomId} not found for shuffling cards`);
        return;
      }
      
      // Ensure the request is from the host
      if (socket.id !== room.host) {
        console.error(`Non-host player ${socket.id} trying to shuffle cards`);
        return;
      }
      
      console.log('Properly placing pegs on board in starting position');
      
      // Use the provided game state from the client as our initial state
      room.gameState = {
        ...deckState,
        phase: deckState?.phase ?? 'playing'
      };
      
      // Validate the game state has necessary components
      let startingSpace = null;
      if (room.gameState.board && room.gameState.board.allSpaces) {
        console.log(`Board has ${room.gameState.board.sections?.length} sections and ${room.gameState.board.allSpaces instanceof Map ? room.gameState.board.allSpaces.size : 0} spaces`);
        
        // Check for a starting space
        if (room.gameState.board.allSpaces instanceof Map) {
          for (const [id, space] of room.gameState.board.allSpaces.entries()) {
            if (space.type === 'starting' || id.includes('_starting')) {
              startingSpace = space;
              break;
            }
          }
        } else {
          for (const id in room.gameState.board.allSpaces) {
            const space = room.gameState.board.allSpaces[id];
            if (space.type === 'starting' || id.includes('_starting')) {
              startingSpace = space;
              break;
            }
          }
        }
        
        if (startingSpace) {
          console.log(`Starting space found with ${startingSpace.pegs?.length || 0} pegs`);
        } else {
          console.log('No starting space found in board');
        }
      } else {
        console.error('Board or allSpaces is missing in game state');
      }
      
      // Log the player setup
      console.log(`Game starting with ${room.gameState.players.length} players`);
      room.gameState.players.forEach((player: any, index: number) => {
        console.log(`Player ${index+1}: ${player.name} (${player.id}) with color ${player.color}`);
        console.log(`  Pegs: ${player.pegs?.length || 0}`);
        console.log(`  Cards: ${player.hand?.length || 0}`);
      });
      
      // Set the current player to the first player
      room.gameState.currentPlayerIndex = 0;
      
      // Log the current player
      const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
      console.log(`Current player after shuffle: ${currentPlayer.name} (${currentPlayer.id})`);
      
      // Broadcast the game state to all clients with extra details
      io.to(roomId).emit('shuffled-cards', {
        gameState: room.gameState,
        players: room.gameState.players.length,
        boardSpaces: room.gameState.board?.allSpaces instanceof Map ? room.gameState.board.allSpaces.size : 0,
        hasStartingSpace: !!startingSpace
      });

      // Also send a game state update to ensure all clients have the latest state
      io.to(roomId).emit('game-state-updated', room.gameState);
    } catch (error) {
      console.error('Error shuffling cards:', error);
    }
  });
  
  // Handle game phase change
  socket.on('change-game-phase', ({ roomId, phase }) => {
    try {
      const room = rooms.get(roomId);
      
      if (!room) {
        console.error('Room not found for phase change:', roomId);
        return;
      }
      
      // Check if user is the host
      if (room.host !== socket.id) {
        console.error('Non-host tried to change game phase:', socket.id);
        return;
      }
      
      console.log(`Changing game phase to ${phase} in room ${roomId}`);
      
      // Broadcast phase change to all players in the room
      io.to(roomId).emit('game-phase-changed', { phase });
    } catch (error) {
      console.error('Error changing game phase:', error);
    }
  });
  
  // Handle player moves
  socket.on('player-move', (data, callback) => {
    const { roomId, moveData } = data;
    console.log(`Player ${socket.id} made a move in room ${roomId}`);

    const room = rooms.get(roomId);
    if (!room) {
      console.error(`Room ${roomId} not found`);
      callback({ success: false, error: 'Room not found' });
      return;
    }

    if (!room.gameState || !room.gameState.players) {
      console.error(`Room ${roomId} has no active game state`);
      callback({ success: false, error: 'Game not started' });
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      console.error(`Player not found in room ${roomId}`);
      callback({ success: false, error: 'Player not found' });
      return;
    }

    const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
    const movePlayerId = moveData?.playerId ?? player.id;

    if (!currentPlayer || (currentPlayer.id !== player.id && currentPlayer.id !== movePlayerId)) {
      console.error(`Not ${player.name}'s turn`);
      callback({ success: false, error: 'Not your turn' });
      return;
    }

    try {
      const playerMoveData = {
        ...moveData,
        playerId: player.id
      };

      console.log('Move details:', {
        playerId: player.id,
        playerName: player.name,
        cardId: moveData?.cardId,
        pegId: moveData?.pegId,
        fromPosition: moveData?.fromPosition,
        toPosition: moveData?.toPosition
      });

      io.to(roomId).emit('player-move', {
        playerId: player.id,
        moveData: playerMoveData
      });

      room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % room.gameState.players.length;
      const nextPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
      console.log(`Turn advanced to player ${nextPlayer?.name}`);

      io.to(roomId).emit('game-state-updated', room.gameState);

      callback({ success: true });
    } catch (err) {
      console.error('Error processing move:', err);
      callback({ success: false, error: 'Error processing move' });
    }
  });

  // Handle players intentionally leaving a room
  socket.on('leave-room', (roomId: string) => {
    console.log(`Socket ${socket.id} requested to leave room ${roomId}`);
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) {
      return;
    }

    const [player] = room.players.splice(playerIndex, 1);
    socket.leave(roomId);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      return;
    }

    if (room.host === socket.id) {
      room.host = room.players[0].socketId;
      io.to(roomId).emit('new-host', {
        newHostId: room.players[0].id,
        newHostName: room.players[0].name
      });
    }

    io.to(roomId).emit('player-left', {
      playerId: player.id,
      playerName: player.name,
      players: serializePlayers(room.players)
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find rooms where this socket is a player
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex !== -1) {
        // Remove player from room
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        
        // If host disconnected, assign new host or close room
        if (room.host === socket.id) {
          if (room.players.length > 0) {
            // Assign first remaining player as the new host
            room.host = room.players[0].socketId;
            io.to(roomId).emit('new-host', { 
              newHostId: room.players[0].id,
              newHostName: room.players[0].name 
            });
          } else {
            // Delete room if no players left
            rooms.delete(roomId);
          }
        }
        
        // Notify remaining players
        io.to(roomId).emit('player-left', {
          playerId: player.id,
          playerName: player.name,
          players: serializePlayers(room.players)
        });
      }
    });
  });

  } // END legacy V1 handlers

  socket.on('disconnect', async () => {
    if (!ENABLE_PROTOCOL_V2) {
      clearSocketSession(socket.id);
      return;
    }

    try {
      const store = await roomStorePromise;
      const socketSession = socketSessions.get(socket.id);
      clearSocketSession(socket.id);
      if (!socketSession) {
        return;
      }

      const room = await store.getRoomByCode(socketSession.roomCode);
      if (!room) {
        return;
      }

      const player = room.players.find(entry => entry.id === socketSession.playerId);
      if (!player) {
        return;
      }

      const previousHostId = room.hostPlayerId;
      const previousPlayerCount = room.players.length;
      player.connected = false;
      player.socketId = null;
      player.disconnectedAt = getNow();
      room.updatedAt = getNow();
      pruneExpiredDisconnectedPlayers(room);

      if (room.players.length === 0) {
        await store.deleteRoom(room.code);
        return;
      }

      await store.saveRoom(room);
      if (room.players.length !== previousPlayerCount) {
        io.to(room.id).emit('player-joined-v2', {
          roomCode: room.code,
          players: serializeV2Players(room.players),
          hostPlayerId: room.hostPlayerId
        });
      }
      if (previousHostId !== room.hostPlayerId) {
        await emitHostUpdate(room);
      }
      await emitPresenceUpdate(room);
    } catch (error) {
      console.error('v2 disconnect handling failed', error);
    }
  });
});

// Choose a port for the server
const PORT = process.env.PORT || 8080;

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
