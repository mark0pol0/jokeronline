"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rooms = void 0;
exports.registerGameServer = registerGameServer;
const crypto_1 = require("crypto");
const ROOM_CODE_BYTES = 3;
const rooms = new Map();
exports.rooms = rooms;
function serializePlayers(players) {
    return players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color
    }));
}
function generateRoomCode() {
    return (0, crypto_1.randomBytes)(ROOM_CODE_BYTES).toString('hex').toUpperCase();
}
function findRoomIdByCode(code) {
    const target = code.toLowerCase();
    for (const [roomId, room] of rooms.entries()) {
        if (room.code.toLowerCase() === target) {
            return roomId;
        }
    }
    return undefined;
}
function ensureHost(room, departingSocketId, io) {
    if (room.host !== departingSocketId) {
        return;
    }
    if (room.players.length === 0) {
        return;
    }
    room.host = room.players[0].socketId;
    io.to(room.id).emit('new-host', {
        newHostId: room.players[0].id,
        newHostName: room.players[0].name
    });
}
function handleCreateRoom(socket, io, playerName, callback) {
    console.log(`Creating room for ${playerName}`);
    const roomCode = generateRoomCode();
    const roomId = `room_${Date.now()}`;
    const player = {
        id: `player-${Date.now()}`,
        name: playerName,
        color: '',
        socketId: socket.id
    };
    const room = {
        id: roomId,
        code: roomCode,
        host: socket.id,
        players: [player],
        gameState: null,
        isGameStarted: false
    };
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
function handleJoinRoom(socket, io, roomCode, playerName, callback) {
    const roomId = findRoomIdByCode(roomCode);
    if (!roomId) {
        console.error(`Room with code ${roomCode} not found`);
        callback({ success: false, error: 'Room not found' });
        return;
    }
    const room = rooms.get(roomId);
    if (!room) {
        console.error(`Room ${roomId} not found for joining`);
        callback({ success: false, error: 'Room not found' });
        return;
    }
    if (room.isGameStarted) {
        callback({
            success: false,
            error: 'Game has already started. You cannot join now.'
        });
        return;
    }
    if (room.players.length >= 8) {
        callback({
            success: false,
            error: 'Room is full. Maximum 8 players allowed.'
        });
        return;
    }
    const player = {
        id: `player-${Date.now()}`,
        name: playerName,
        color: '',
        socketId: socket.id
    };
    room.players.push(player);
    socket.join(roomId);
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
function handleStartGame(socket, io, roomId, callback) {
    const room = rooms.get(roomId);
    if (!room) {
        console.error(`Room ${roomId} not found for game start`);
        callback({ success: false, error: 'Room not found' });
        return;
    }
    if (room.host !== socket.id) {
        callback({ success: false, error: 'Only the host can start the game' });
        return;
    }
    room.isGameStarted = true;
    io.to(roomId).emit('game-started', {
        players: serializePlayers(room.players)
    });
    callback({ success: true });
}
function handleUpdatePlayerColor(socket, io, data, callback) {
    const { roomId, playerId, color } = data;
    const room = rooms.get(roomId);
    if (!room) {
        console.error(`Room ${roomId} not found for color update`);
        callback({ success: false, error: 'Room not found' });
        return;
    }
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
        callback({ success: false, error: 'Player not found' });
        return;
    }
    player.color = color;
    io.to(roomId).emit('player-color-updated', { playerId, color });
    callback({ success: true, players: serializePlayers(room.players) });
}
function handleUpdateGameState(socket, io, payload) {
    const { roomId, gameState } = payload;
    const room = rooms.get(roomId);
    if (!room) {
        console.error(`Room ${roomId} not found for game state update`);
        return;
    }
    room.gameState = gameState;
    io.to(roomId).emit('game-state-updated', room.gameState);
}
function handleShuffleCards(socket, io, payload) {
    const { roomId, deckState } = payload;
    const room = rooms.get(roomId);
    if (!room) {
        console.error(`Room ${roomId} not found for shuffling cards`);
        return;
    }
    if (socket.id !== room.host) {
        console.error(`Non-host player ${socket.id} trying to shuffle cards`);
        return;
    }
    room.gameState = {
        ...deckState,
        phase: deckState?.phase ?? 'playing'
    };
    room.gameState.currentPlayerIndex = 0;
    io.to(roomId).emit('shuffled-cards', {
        gameState: room.gameState,
        players: room.gameState.players?.length ?? 0,
        boardSpaces: room.gameState.board?.allSpaces instanceof Map
            ? room.gameState.board.allSpaces.size
            : Object.keys(room.gameState.board?.allSpaces ?? {}).length,
        hasStartingSpace: Boolean(room.gameState.board)
    });
    io.to(roomId).emit('game-state-updated', room.gameState);
}
function handleChangeGamePhase(socket, io, payload) {
    const { roomId, phase } = payload;
    const room = rooms.get(roomId);
    if (!room) {
        console.error('Room not found for phase change:', roomId);
        return;
    }
    if (room.host !== socket.id) {
        console.error('Non-host tried to change game phase:', socket.id);
        return;
    }
    io.to(roomId).emit('game-phase-changed', { phase });
}
function handlePlayerMove(socket, io, data, callback) {
    const { roomId, moveData } = data ?? {};
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
    }
    if (!room.gameState || !room.gameState.players) {
        callback({ success: false, error: 'Room has no active game state' });
        return;
    }
    const player = room.players.find((entry) => entry.socketId === socket.id);
    if (!player) {
        callback({ success: false, error: 'Player not found in room' });
        return;
    }
    const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
    const movePlayerId = moveData?.playerId ?? player.id;
    if (!currentPlayer || (currentPlayer.id !== player.id && currentPlayer.id !== movePlayerId)) {
        callback({ success: false, error: 'Not your turn' });
        return;
    }
    const playerMoveData = {
        ...moveData,
        playerId: player.id
    };
    io.to(roomId).emit('player-move', {
        playerId: player.id,
        moveData: playerMoveData
    });
    if (Array.isArray(room.gameState.players) && room.gameState.players.length > 0) {
        room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % room.gameState.players.length;
        io.to(roomId).emit('game-state-updated', room.gameState);
    }
    callback({ success: true });
}
function handleLeaveRoom(socket, io, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        return;
    }
    const playerIndex = room.players.findIndex((entry) => entry.socketId === socket.id);
    if (playerIndex === -1) {
        return;
    }
    const [player] = room.players.splice(playerIndex, 1);
    socket.leave(roomId);
    if (room.players.length === 0) {
        rooms.delete(roomId);
        return;
    }
    ensureHost(room, socket.id, io);
    io.to(roomId).emit('player-left', {
        playerId: player.id,
        playerName: player.name,
        players: serializePlayers(room.players)
    });
}
function handleDisconnect(socket, io) {
    rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex((entry) => entry.socketId === socket.id);
        if (playerIndex === -1) {
            return;
        }
        const [player] = room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
            rooms.delete(roomId);
            return;
        }
        ensureHost(room, socket.id, io);
        io.to(roomId).emit('player-left', {
            playerId: player.id,
            playerName: player.name,
            players: serializePlayers(room.players)
        });
    });
}
const FLAG_KEY = Symbol.for('joker-pursuit.handlers');
function registerGameServer(io) {
    const flagged = io;
    if (flagged[FLAG_KEY]) {
        return io;
    }
    flagged[FLAG_KEY] = true;
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);
        socket.emit('debug', { message: 'You are connected to the server!' });
        socket.on('create-room', (playerName, callback) => {
            try {
                handleCreateRoom(socket, io, playerName, callback);
            }
            catch (error) {
                console.error('Error creating room:', error);
                callback({ success: false, error: 'Failed to create room' });
            }
        });
        socket.on('join-room', (roomCode, playerName, callback) => {
            try {
                handleJoinRoom(socket, io, roomCode, playerName, callback);
            }
            catch (error) {
                console.error('Error joining room:', error);
                callback({ success: false, error: 'Failed to join room' });
            }
        });
        socket.on('start-game', (roomId, callback) => {
            try {
                handleStartGame(socket, io, roomId, callback);
            }
            catch (error) {
                console.error('Error starting game:', error);
                callback({ success: false, error: 'Failed to start game' });
            }
        });
        socket.on('update-player-color', (data, callback) => {
            try {
                handleUpdatePlayerColor(socket, io, data, callback);
            }
            catch (error) {
                console.error('Error updating player color:', error);
                callback({ success: false, error: 'Failed to update player color' });
            }
        });
        socket.on('update-game-state', (payload) => {
            try {
                handleUpdateGameState(socket, io, payload);
            }
            catch (error) {
                console.error('Error updating game state:', error);
            }
        });
        socket.on('shuffle-cards', (payload) => {
            try {
                handleShuffleCards(socket, io, payload);
            }
            catch (error) {
                console.error('Error shuffling cards:', error);
            }
        });
        socket.on('change-game-phase', (payload) => {
            try {
                handleChangeGamePhase(socket, io, payload);
            }
            catch (error) {
                console.error('Error changing game phase:', error);
            }
        });
        socket.on('player-move', (data, callback) => {
            try {
                handlePlayerMove(socket, io, data, callback);
            }
            catch (error) {
                console.error('Error processing move:', error);
                callback?.({ success: false, error: 'Error processing move' });
            }
        });
        socket.on('leave-room', (roomId) => {
            try {
                handleLeaveRoom(socket, io, roomId);
            }
            catch (error) {
                console.error('Error leaving room:', error);
            }
        });
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            try {
                handleDisconnect(socket, io);
            }
            catch (error) {
                console.error('Error handling disconnect:', error);
            }
        });
    });
    return io;
}
