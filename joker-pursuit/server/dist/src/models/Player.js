"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasLegalMoves = exports.isPlayerComplete = exports.createPlayer = void 0;
// Function to create a player with default values
const createPlayer = (id, name, teamId, color) => {
    return {
        id,
        name,
        hand: [],
        pegs: [
            `${id}-peg-1`,
            `${id}-peg-2`,
            `${id}-peg-3`,
            `${id}-peg-4`,
            `${id}-peg-5`
        ],
        isComplete: false,
        teamId,
        color
    };
};
exports.createPlayer = createPlayer;
// Check if a player has all pegs in their castle
const isPlayerComplete = (player, castleSpaces) => {
    // This would check if all pegs are in castle spaces
    // We'll implement this as part of the board space tracking
    return player.isComplete;
};
exports.isPlayerComplete = isPlayerComplete;
// Check if a player has any legal moves with their current hand
const hasLegalMoves = (player) => {
    // This would be a complex function that checks each card against the board state
    // We'll implement this later as part of the movement system
    return true; // Placeholder
};
exports.hasLegalMoves = hasLegalMoves;
