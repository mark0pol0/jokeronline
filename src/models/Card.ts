export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'ace' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king' | 'joker';

export interface Card {
  id: string;
  suit: Suit | null; // null for jokers
  rank: Rank;
  value: number; // Numeric value for movement
  isFace: boolean; // Whether it's a face card (J, Q, K)
  canSplit: boolean; // Whether the card can be split (7, 9)
  moveBackward: boolean; // Whether the card moves backward (8)
  canJump: boolean; // Whether the card allows jumping over pegs
  canBump: boolean; // Whether the card can bump other pegs
  canCornerToCorner: boolean; // Whether the card can move corner-to-corner (Ace)
}

export const createCard = (suit: Suit | null, rank: Rank): Card => {
  // Determine the properties based on rank
  const isFace = ['jack', 'queen', 'king'].includes(rank);
  const isAce = rank === 'ace';
  const isJoker = rank === 'joker';
  const isSeven = rank === '7';
  const isEight = rank === '8';
  const isNine = rank === '9';
  
  // Calculate value for movement
  let value: number;
  if (isAce) value = 1;
  else if (isFace) value = 10;
  else if (isJoker) value = 0; // Special case, doesn't move by spaces
  else value = parseInt(rank, 10); // For numbered cards
  
  return {
    id: `${rank}_${suit || 'none'}_${Math.random().toString(36).substring(2, 9)}`,
    suit,
    rank,
    value,
    isFace,
    canSplit: isSeven || isNine,
    moveBackward: isEight,
    canJump: isJoker || isAce,
    canBump: isJoker,
    canCornerToCorner: isAce
  };
};

// Create a complete deck of cards (54 cards including jokers)
export const createDeck = (): Card[] => {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  
  // Create standard cards (52)
  const cards: Card[] = [];
  suits.forEach(suit => {
    ranks.forEach(rank => {
      cards.push(createCard(suit, rank));
    });
  });
  
  // Add jokers (2)
  cards.push(createCard(null, 'joker'));
  cards.push(createCard(null, 'joker'));
  
  return cards;
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