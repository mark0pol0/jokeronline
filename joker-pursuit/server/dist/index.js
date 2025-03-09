"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const crypto_1 = require("crypto");
// Create Express app
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
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
        origin: '*', // Allow all origins in development
        methods: ['GET', 'POST'],
        credentials: false
    },
    pingTimeout: 60000,
    pingInterval: 25000
});
// Store active game rooms
const rooms = {};
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
            rooms[roomId] = room;
            socket.join(roomId);
            console.log(`Room created: ${roomId} with code: ${roomCode}`);
            callback({ success: true, roomId, roomCode, playerId: player.id });
        }
        catch (error) {
            console.error('Error creating room:', error);
            callback({ success: false, error: 'Failed to create room' });
        }
    });
    // Join an existing game room
    socket.on('join-room', (roomCode, playerName, callback) => {
        try {
            // Find room with matching code (case insensitive)
            const roomId = Object.keys(rooms).find(id => rooms[id].code.toLowerCase() === roomCode.toLowerCase());
            if (!roomId) {
                return callback({
                    success: false,
                    error: 'Room not found. Please check the room code and try again.'
                });
            }
            const room = rooms[roomId];
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
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
            });
            callback({
                success: true,
                roomId,
                roomCode: room.code,
                playerId: player.id,
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
            });
        }
        catch (error) {
            console.error('Error joining room:', error);
            callback({ success: false, error: 'Failed to join room' });
        }
    });
    // Start game
    socket.on('start-game', (roomId, callback) => {
        try {
            const room = rooms[roomId];
            if (!room) {
                return callback({ success: false, error: 'Room not found' });
            }
            // Check if user is the host
            if (room.host !== socket.id) {
                return callback({ success: false, error: 'Only the host can start the game' });
            }
            room.isGameStarted = true;
            // Notify all players that game is starting
            io.to(roomId).emit('game-started', {
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
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
            const room = rooms[roomId];
            if (!room) {
                return callback({ success: false, error: 'Room not found' });
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
                    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
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
            const room = rooms[roomId];
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
            const room = rooms[roomId];
            if (room) {
                // Update room game state with new deck
                if (!room.gameState) {
                    room.gameState = {};
                }
                // Make sure we have player info (crucial, this is what was missing)
                if (!room.gameState.players || room.gameState.players.length === 0) {
                    console.log('Players array missing or empty in game state, adding from room players');
                    room.gameState.players = room.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        color: p.color,
                        hand: [],
                        // Initialize 5 pegs for each player with proper IDs
                        pegs: [
                            `${p.id}-peg-1`,
                            `${p.id}-peg-2`,
                            `${p.id}-peg-3`,
                            `${p.id}-peg-4`,
                            `${p.id}-peg-5`
                        ],
                        isComplete: false,
                        teamId: 0
                    }));
                }
                // Merge deck state with game state
                room.gameState = {
                    ...room.gameState,
                    ...deckState,
                    phase: 'playing' // Set to playing phase
                };
                // Make sure pegs are properly initialized in the right places
                if (room.gameState.board && room.gameState.players) {
                    console.log('Properly placing pegs on board in starting position');
                    // Enhanced debug logging to see board structure
                    try {
                        console.log(`Board spaces count: ${typeof room.gameState.board.allSpaces === 'object'
                            ? Object.keys(room.gameState.board.allSpaces).length
                            : room.gameState.board.allSpaces.size}`);
                        // Log a few space IDs to help debugging
                        const spaceArray = typeof room.gameState.board.allSpaces === 'object'
                            ? Object.values(room.gameState.board.allSpaces)
                            : Array.from(room.gameState.board.allSpaces.values());
                        console.log(`Space sample IDs: ${spaceArray.slice(0, 5).map((s) => s.id).join(', ')}`);
                        console.log(`Space types: ${spaceArray.slice(0, 5).map((s) => s.type).join(', ')}`);
                        // Find the starting space with enhanced logging and fallbacks
                        let startingSpace;
                        let allBoardSpaces = [];
                        if (room.gameState.board.allSpaces instanceof Map) {
                            allBoardSpaces = Array.from(room.gameState.board.allSpaces.values());
                        }
                        else if (typeof room.gameState.board.allSpaces === 'object') {
                            allBoardSpaces = Object.values(room.gameState.board.allSpaces);
                        }
                        // 1. First try to find section1_starting (most reliable ID)
                        startingSpace = allBoardSpaces.find((space) => space.id === 'section1_starting');
                        // 2. If not found, try to find any starting space by ID pattern
                        if (!startingSpace) {
                            startingSpace = allBoardSpaces.find((space) => space.id && space.id.includes('_starting'));
                        }
                        // 3. If still not found, look by type
                        if (!startingSpace) {
                            startingSpace = allBoardSpaces.find((space) => space.type === 'starting');
                        }
                        // 4. Fallback: if no starting space found, create one
                        if (!startingSpace) {
                            console.log('No starting space found, creating a fallback starting space');
                            // Find the first section to get its dimensions
                            const firstSection = room.gameState.board.sections && room.gameState.board.sections[0];
                            // Create a new starting space in the center
                            startingSpace = {
                                id: 'fallback_starting',
                                type: 'starting',
                                x: 700, // Default center X
                                y: 700, // Default center Y
                                index: -1,
                                label: 'Start',
                                pegs: [],
                                sectionIndex: 0
                            };
                            // Add this starting space to the board
                            if (room.gameState.board.allSpaces instanceof Map) {
                                room.gameState.board.allSpaces.set(startingSpace.id, startingSpace);
                            }
                            else if (typeof room.gameState.board.allSpaces === 'object') {
                                room.gameState.board.allSpaces[startingSpace.id] = startingSpace;
                            }
                            console.log('Created fallback starting space:', startingSpace);
                        }
                        // Place all pegs in the starting space
                        if (startingSpace) {
                            console.log('Found starting space, adding all pegs');
                            if (!Array.isArray(startingSpace.pegs)) {
                                startingSpace.pegs = []; // Ensure pegs array exists
                            }
                            else {
                                startingSpace.pegs = []; // Clear existing pegs
                            }
                            // Log all pegs we're adding
                            const allPegs = [];
                            room.gameState.players.forEach((player) => {
                                console.log(`Adding ${player.pegs.length} pegs for player ${player.name} (${player.id})`);
                                allPegs.push(...player.pegs);
                            });
                            startingSpace.pegs = allPegs;
                            console.log(`Total pegs placed in starting circle: ${startingSpace.pegs.length}`);
                            // For debug, log the first few pegs
                            if (startingSpace.pegs.length > 0) {
                                console.log(`Sample pegs: ${startingSpace.pegs.slice(0, 3).join(', ')}`);
                            }
                        }
                        else {
                            console.log('No starting space found in board, pegs will not be visible');
                        }
                    }
                    catch (error) {
                        console.error('Error logging board structure:', error);
                    }
                }
                // Log current player
                const currentPlayerIndex = room.gameState.currentPlayerIndex || 0;
                const currentPlayer = room.gameState.players[currentPlayerIndex];
                console.log(`Current player after shuffle: ${currentPlayer?.name} (${currentPlayer?.id})`);
                // Broadcast to all players
                console.log(`Emitting shuffled-cards event with game state: { players: ${room.gameState.players.length}, currentPlayerIndex: ${currentPlayerIndex} }`);
                io.to(roomId).emit('shuffled-cards', room.gameState);
            }
            else {
                console.error(`Room ${roomId} not found for shuffle`);
            }
        }
        catch (error) {
            console.error('Error handling shuffle cards:', error);
        }
    });
    // Handle game phase change
    socket.on('change-game-phase', ({ roomId, phase }) => {
        try {
            const room = rooms[roomId];
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
    socket.on('player-move', ({ roomId, playerId, moveData }) => {
        try {
            console.log(`Player ${playerId} made a move in room ${roomId}`);
            const room = rooms[roomId];
            if (room) {
                // Store the updated game state from the move
                if (moveData.gameState) {
                    room.gameState = moveData.gameState;
                    console.log(`Broadcasting player move to all players in room ${roomId}`);
                    console.log(`Current player after move: ${room.gameState.players[room.gameState.currentPlayerIndex]?.name}`);
                    // Broadcast to ALL players in the room using same pattern as color selection
                    io.to(roomId).emit('player-move', {
                        playerId,
                        moveData,
                        gameState: room.gameState
                    });
                }
                else {
                    console.error('Move data is missing game state');
                }
            }
            else {
                console.error(`Room ${roomId} not found for player move`);
            }
        }
        catch (error) {
            console.error('Error handling player move:', error);
        }
    });
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Find rooms where this socket is a player
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
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
                        delete rooms[roomId];
                        return;
                    }
                }
                // Notify remaining players
                io.to(roomId).emit('player-left', {
                    playerId: player.id,
                    playerName: player.name,
                    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
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
