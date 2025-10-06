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
const envPath = path_1.default.resolve(__dirname, '..', '.env');
(0, env_1.loadEnvFile)(envPath);
const crypto_1 = require("crypto");
// Helper to serialize players for client responses
function serializePlayers(players) {
    return players.map(p => ({ id: p.id, name: p.name, color: p.color }));
}
// Resolve allowed origins for CORS/Socket.IO
const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://localhost:5173'
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
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
// Create Express app
const app = (0, express_1.default)();
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
// Add a simple endpoint for testing
app.get('/', (req, res) => {
    res.send('Joker Pursuit Game Server is running!');
});
// Create HTTP server
const server = http_1.default.createServer(app);
// Create Socket.IO server with simplified options
const io = new socket_io_1.Server(server, {
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
// Store active game rooms
const rooms = new Map();
// Generate a unique, simple 6-character code for rooms
function generateRoomCode() {
    return (0, crypto_1.randomBytes)(3).toString('hex').toUpperCase();
}
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // Debug connection event
    socket.emit('debug', { message: 'You are connected to the server!' });
    // Create a new game room
    socket.on('create-room', (playerName, callback) => {
        try {
            console.log(`Creating room for ${playerName}`);
            const roomCode = generateRoomCode();
            const roomId = `room_${Date.now()}`;
            // Create new player
            const player = {
                id: `player-${Date.now()}`,
                name: playerName,
                color: '', // Will be set during game setup
                socketId: socket.id
            };
            // Create new room
            const room = {
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
        }
        catch (error) {
            console.error('Error creating room:', error);
            callback({ success: false, error: 'Failed to create room' });
        }
    });
    // Join an existing game room
    socket.on('join-room', (roomCode, playerName, callback) => {
        try {
            // Check if room code already exists
            const roomId = Array.from(rooms.keys()).find(id => rooms.get(id)?.code.toLowerCase() === roomCode.toLowerCase());
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
                const player = {
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
            }
            else {
                console.error(`Room with code ${roomCode} not found`);
                callback({ success: false, error: 'Room not found' });
            }
        }
        catch (error) {
            console.error('Error joining room:', error);
            callback({ success: false, error: 'Failed to join room' });
        }
    });
    // Start game
    socket.on('start-game', (roomId, callback) => {
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
        }
        catch (error) {
            console.error('Error starting game:', error);
            callback({ success: false, error: 'Failed to start game' });
        }
    });
    // Update player color
    socket.on('update-player-color', (data, callback) => {
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
            }
            else {
                callback({ success: false, error: 'Player not found' });
            }
        }
        catch (error) {
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
            }
            else {
                console.error(`Room ${roomId} not found for game state update`);
            }
        }
        catch (error) {
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
                }
                else {
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
                }
                else {
                    console.log('No starting space found in board');
                }
            }
            else {
                console.error('Board or allSpaces is missing in game state');
            }
            // Log the player setup
            console.log(`Game starting with ${room.gameState.players.length} players`);
            room.gameState.players.forEach((player, index) => {
                console.log(`Player ${index + 1}: ${player.name} (${player.id}) with color ${player.color}`);
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (err) {
            console.error('Error processing move:', err);
            callback({ success: false, error: 'Error processing move' });
        }
    });
    // Handle players intentionally leaving a room
    socket.on('leave-room', (roomId) => {
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
                    }
                    else {
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
});
// Choose a port for the server
const PORT = process.env.PORT || 8080;
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
