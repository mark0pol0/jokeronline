"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shuffleDeck = exports.createDeck = void 0;
// Helper function to convert rank to numeric value
const rankToValue = (rank) => {
    switch (rank) {
        case 'ace': return 1;
        case 'jack':
        case 'queen':
        case 'king': return 10;
        case 'joker': return 0;
        case 'hidden': return 0; // Hidden cards have no value
        default: return parseInt(rank);
    }
};
// Helper function to determine if a card is a face card
const isFaceCard = (rank) => {
    return rank === 'jack' || rank === 'queen' || rank === 'king';
};
// Create a deck of cards
const createDeck = () => {
    const ranks = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const deck = [];
    // Add standard cards
    ranks.forEach(rank => {
        suits.forEach(suit => {
            deck.push({
                id: `${rank}_${suit}`,
                rank,
                suit,
                value: rankToValue(rank),
                isFace: isFaceCard(rank)
            });
        });
    });
    // Add jokers
    deck.push({
        id: 'joker_1',
        rank: 'joker',
        suit: 'none',
        value: 0,
        isFace: false
    });
    deck.push({
        id: 'joker_2',
        rank: 'joker',
        suit: 'none',
        value: 0,
        isFace: false
    });
    return deck;
};
exports.createDeck = createDeck;
// Shuffle a deck of cards
const shuffleDeck = (deck) => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};
exports.shuffleDeck = shuffleDeck;
