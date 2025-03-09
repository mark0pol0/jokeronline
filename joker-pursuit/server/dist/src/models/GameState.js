"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceToNextPlayer = exports.isGameOver = exports.shuffleAndDealCards = exports.createInitialGameState = void 0;
const BoardModel_1 = require("./BoardModel");
const Card_1 = require("./Card");
const Player_1 = require("./Player");
const uuid_1 = require("uuid");
// Create initial game state
const createInitialGameState = (playerNames, playerTeams, numBoardSections, playerColors) => {
    // Create players
    const players = playerNames.map((name, index) => {
        const id = `player-${index + 1}`;
        const teamId = playerTeams[id] || index % 2;
        return (0, Player_1.createPlayer)(id, name, teamId);
    });
    // Create board with correct number of sections and associate player colors
    const boardId = (0, uuid_1.v4)();
    const board = (0, BoardModel_1.createBoard)(boardId, numBoardSections, playerColors);
    // Associate players with board sections and place pegs in home slots
    players.forEach((player) => {
        // Get the player's section (player-1 -> section1, player-2 -> section2, etc.)
        const playerNumber = parseInt(player.id.split('-')[1]);
        const sectionIndex = playerNumber - 1;
        const section = board.sections[sectionIndex];
        if (section) {
            // Associate this section with the player
            section.playerIds = [player.id];
            section.color = playerColors[player.id] || '#CCCCCC';
            // Find the home slots for this section
            const homeSlots = Array.from(board.allSpaces.values()).filter(space => space.sectionIndex === sectionIndex &&
                space.type === 'home').sort((a, b) => a.index - b.index); // Sort by index to ensure proper order
            // Place each peg in a home slot
            player.pegs.forEach((pegId, pegIndex) => {
                if (homeSlots[pegIndex]) {
                    homeSlots[pegIndex].pegs.push(pegId);
                }
            });
        }
    });
    // Create one deck per player
    const decks = Array(players.length).fill(null).map((_, deckIndex) => {
        const deck = (0, Card_1.createDeck)();
        // Make card IDs unique by adding deck index
        return deck.map(card => ({
            ...card,
            id: `${card.id}_deck${deckIndex}`
        }));
    });
    const combinedDeck = decks.flat();
    // Create initial game state (cards will be shuffled later)
    const gameState = {
        id: (0, uuid_1.v4)(),
        phase: 'welcome',
        players,
        currentPlayerIndex: 0,
        board,
        drawPile: combinedDeck,
        discardPile: [],
        moves: []
    };
    return gameState;
};
exports.createInitialGameState = createInitialGameState;
// Shuffle the deck and deal cards
const shuffleAndDealCards = (gameState) => {
    const newState = { ...gameState };
    // Shuffle all cards
    newState.drawPile = [...newState.drawPile].sort(() => Math.random() - 0.5);
    // Deal 5 cards to each player
    newState.players.forEach(player => {
        player.hand = [];
        for (let i = 0; i < 5; i++) {
            if (newState.drawPile.length > 0) {
                player.hand.push(newState.drawPile.pop());
            }
        }
    });
    newState.phase = 'playing';
    return newState;
};
exports.shuffleAndDealCards = shuffleAndDealCards;
// Check if game is over
const isGameOver = (gameState) => {
    // Check if any team has all players complete
    const teamCompletion = {};
    gameState.players.forEach(player => {
        const teamId = player.teamId;
        // Check if this player has all pegs in castle
        const allPegsInCastle = player.pegs.every(pegId => {
            // Find the space this peg is in
            let pegSpace;
            // Use Array.from() to convert Map values to an array before iterating
            Array.from(gameState.board.allSpaces.values()).forEach(space => {
                if (space.pegs.includes(pegId)) {
                    pegSpace = space;
                }
            });
            // Check if the space is a castle
            return (pegSpace === null || pegSpace === void 0 ? void 0 : pegSpace.type) === 'castle';
        });
        // If any player in a team is not complete, the team is not complete
        if (!allPegsInCastle) {
            teamCompletion[teamId] = false;
        }
        else if (teamCompletion[teamId] !== false) {
            teamCompletion[teamId] = true;
        }
    });
    // Check if any team has completed the game
    for (const teamId in teamCompletion) {
        if (teamCompletion[teamId]) {
            // Find the first player in the winning team
            const winningPlayer = gameState.players.find(player => player.teamId === parseInt(teamId));
            if (winningPlayer) {
                gameState.winner = {
                    playerId: winningPlayer.id,
                    teamId: winningPlayer.teamId
                };
                gameState.phase = 'gameOver';
                return true;
            }
        }
    }
    return false;
};
exports.isGameOver = isGameOver;
// Advance to the next player
const advanceToNextPlayer = (gameState) => {
    const newState = { ...gameState };
    // Move to the next player index
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
    // Check if the game is over
    (0, exports.isGameOver)(newState);
    return newState;
};
exports.advanceToNextPlayer = advanceToNextPlayer;
