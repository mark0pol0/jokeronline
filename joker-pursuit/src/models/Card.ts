export type Rank = 'ace' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king' | 'joker';
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'none';

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
  value: number;
  isFace: boolean;
}

// Helper function to convert rank to numeric value
const rankToValue = (rank: Rank): number => {
  switch (rank) {
    case 'ace': return 1;
    case 'jack': 
    case 'queen': 
    case 'king': return 10;
    case 'joker': return 0;
    default: return parseInt(rank);
  }
};

// Helper function to determine if a card is a face card
const isFaceCard = (rank: Rank): boolean => {
  return rank === 'jack' || rank === 'queen' || rank === 'king';
};

// Create a deck of cards
export const createDeck = (): Card[] => {
  const ranks: Rank[] = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: Card[] = [];
  
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

// Shuffle a deck of cards
export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}; 