"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const uuid_1 = require("uuid");
const GameState_1 = require("../../src/models/GameState");
const PORT = process.env.PORT || 3001;
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Set up Socket.io with CORS configuration
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // In production, you should restrict this to your frontend URL
        methods: ['GET', 'POST']
    }
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
    app.use(express_1.default.static(path_1.default.join(__dirname, '../../build')));
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(__dirname, '../../build/index.html'));
    });
}
// Store active games
const games = new Map();
// Send updated game state to all clients in room
const sendGameStateToClients = (gameId, gameState, gameRoom) => {
    // For each player in the game, send a customized game state
    for (const player of gameRoom.players) {
        // Create a deep copy of the game state
        const playerGameState = JSON.parse(JSON.stringify(gameState));
        // Hide other players' cards
        playerGameState.players.forEach((statePlayer) => {
            // If this is not the current player, hide their cards
            if (statePlayer.id !== player.id) {
                // Replace actual cards with placeholder objects
                statePlayer.hand = statePlayer.hand.map(() => ({
                    id: 'hidden',
                    rank: 'hidden',
                    suit: 'hidden'
                }));
            }
        });
        // Send the customized state to just this player
        if (io.sockets.sockets.get(player.socketId)) {
            io.to(player.socketId).emit('gameState', playerGameState);
        }
    }
};
// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    // Track socket's current game and player ID
    let currentGameId = null;
    let currentPlayerId = null;
    // Create a new game
    socket.on('createGame', (playerName, callback) => {
        try {
            const gameId = (0, uuid_1.v4)().substring(0, 6).toUpperCase(); // Shorter, readable game ID
            const playerId = `player-1`;
            // Remember this socket's game and player
            currentGameId = gameId;
            currentPlayerId = playerId;
            // Initialize game state
            const initialGameState = (0, GameState_1.createInitialGameState)([playerName], // Start with just the host
            { [playerId]: 0 }, // First player is team 0
            1, // Start with 1 section
            { [playerId]: '#FF5733' } // Default color for first player
            );
            // Create game room
            const gameRoom = {
                gameState: initialGameState,
                players: [{
                        id: playerId,
                        name: playerName,
                        socketId: socket.id
                    }]
            };
            games.set(gameId, gameRoom);
            // Join socket to game room
            socket.join(gameId);
            console.log(`Game ${gameId} created by ${playerName}`);
            // Send game ID back to creator via callback
            callback(gameId);
            // Send initial game state to creator
            sendGameStateToClients(gameId, initialGameState, gameRoom);
        }
        catch (error) {
            console.error('Error creating game:', error);
            socket.emit('error', 'Failed to create game');
        }
    });
    // Join an existing game
    socket.on('joinGame', (gameId, playerName) => {
        try {
            const gameRoom = games.get(gameId);
            if (!gameRoom) {
                socket.emit('gameNotFound');
                return;
            }
            // Generate player ID based on current number of players
            const playerId = `player-${gameRoom.players.length + 1}`;
            const teamId = (gameRoom.players.length) % 2; // Alternate teams
            // Add player to game state
            const { gameState } = gameRoom;
            // Update playerNames, colors, and teams
            gameState.players.push({
                id: playerId,
                name: playerName,
                hand: [],
                pegs: [
                    `${playerId}-peg-1`,
                    `${playerId}-peg-2`,
                    `${playerId}-peg-3`,
                    `${playerId}-peg-4`,
                    `${playerId}-peg-5`
                ],
                isComplete: false,
                teamId
            });
            // Add player to room tracking
            gameRoom.players.push({
                id: playerId,
                name: playerName,
                socketId: socket.id
            });
            // Join socket to game room
            socket.join(gameId);
            // Notify room of new player
            io.to(gameId).emit('playerJoined', playerId, playerName);
            // Send personalized game state to each player
            sendGameStateToClients(gameId, gameState, gameRoom);
            console.log(`Player ${playerName} joined game ${gameId}`);
        }
        catch (error) {
            console.error('Error joining game:', error);
            socket.emit('error', 'Failed to join game');
        }
    });
    // Start the game
    socket.on('startGame', (gameId) => {
        try {
            const gameRoom = games.get(gameId);
            if (!gameRoom) {
                socket.emit('gameNotFound');
                return;
            }
            // First, notify all clients to show the shuffle animation
            // We'll set a temporary shuffling flag
            const shufflingState = JSON.parse(JSON.stringify(gameRoom.gameState));
            shufflingState.isShuffling = true;
            // Send the shuffling state to all clients
            sendGameStateToClients(gameId, shufflingState, gameRoom);
            // After animation delay, update the game state with shuffled cards
            setTimeout(() => {
                // Shuffle cards and deal to players
                gameRoom.gameState = (0, GameState_1.shuffleAndDealCards)(gameRoom.gameState);
                // Clear the shuffling flag
                gameRoom.gameState.isShuffling = false;
                // Send personalized game state to each player
                sendGameStateToClients(gameId, gameRoom.gameState, gameRoom);
                console.log(`Game ${gameId} started`);
            }, 3000); // 3 second delay to match the client animation
        }
        catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', 'Failed to start game');
        }
    });
    // Handle a player's move
    socket.on('makeMove', (gameId, move) => {
        try {
            const gameRoom = games.get(gameId);
            if (!gameRoom) {
                socket.emit('gameNotFound');
                return;
            }
            // Apply the move to the game state
            // This would call your existing move application logic
            // For now we'll just record the move in the game state
            gameRoom.gameState.moves.push(move);
            // Advance to the next player
            gameRoom.gameState = (0, GameState_1.advanceToNextPlayer)(gameRoom.gameState);
            // Send personalized game state to each player
            sendGameStateToClients(gameId, gameRoom.gameState, gameRoom);
            console.log(`Move made in game ${gameId} by player ${move.playerId}`);
        }
        catch (error) {
            console.error('Error making move:', error);
            socket.emit('error', 'Failed to make move');
        }
    });
    // Handle discard hand request
    socket.on('discardHand', (gameId, playerId) => {
        try {
            const gameRoom = games.get(gameId);
            if (!gameRoom) {
                socket.emit('gameNotFound');
                return;
            }
            // Find the player in the game state
            const playerIndex = gameRoom.gameState.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) {
                socket.emit('error', 'Player not found');
                return;
            }
            // Clear the player's hand
            gameRoom.gameState.players[playerIndex].hand = [];
            // Draw new cards for the player (assuming 5 cards per hand)
            for (let i = 0; i < 5; i++) {
                if (gameRoom.gameState.drawPile.length > 0) {
                    const card = gameRoom.gameState.drawPile.pop();
                    if (card) {
                        gameRoom.gameState.players[playerIndex].hand.push(card);
                    }
                }
            }
            // Move to next player
            gameRoom.gameState = (0, GameState_1.advanceToNextPlayer)(gameRoom.gameState);
            // Send personalized game state to each player
            sendGameStateToClients(gameId, gameRoom.gameState, gameRoom);
            console.log(`Player ${playerId} discarded their hand in game ${gameId}`);
        }
        catch (error) {
            console.error('Error discarding hand:', error);
            socket.emit('error', 'Failed to discard hand');
        }
    });
    // Handle player reconnections
    socket.on('rejoinGame', (gameId) => {
        try {
            console.log(`Player attempting to rejoin game ${gameId} with socket ID ${socket.id}`);
            const gameRoom = games.get(gameId);
            if (!gameRoom) {
                socket.emit('gameNotFound');
                return;
            }
            // Find if this player was in the game before
            let playerRejoined = false;
            for (const player of gameRoom.players) {
                // Check if the socket is reconnecting
                if (player.socketId !== socket.id && !io.sockets.sockets.get(player.socketId)) {
                    console.log(`Player ${player.name} (${player.id}) reconnected`);
                    // Update the socket ID for this player
                    player.socketId = socket.id;
                    // Remember this socket's game and player
                    currentGameId = gameId;
                    currentPlayerId = player.id;
                    // Join socket to game room
                    socket.join(gameId);
                    playerRejoined = true;
                    // Notify the player they've rejoined
                    socket.emit('playerJoined', player.id, player.name);
                    // Send game state
                    sendGameStateToClients(gameId, gameRoom.gameState, gameRoom);
                    break;
                }
            }
            if (!playerRejoined) {
                console.log(`Could not find disconnected player for game ${gameId}`);
                socket.emit('error', 'Could not rejoin game - player not found');
            }
        }
        catch (error) {
            console.error('Error rejoining game:', error);
            socket.emit('error', 'Failed to rejoin game');
        }
    });
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // If the player was in a game, keep their spot for potential reconnection
        if (currentGameId) {
            console.log(`Player was in game ${currentGameId} - keeping their spot for 10 minutes`);
            // Could implement a timeout to remove player if they don't reconnect within a certain time
            // But for simplicity, we'll keep their spot indefinitely for now
        }
    });
});
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
exports.default = server;
