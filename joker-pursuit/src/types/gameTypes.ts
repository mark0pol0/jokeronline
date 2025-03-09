// Card types
export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'joker';

export interface Card {
  id: string;
  suit: CardSuit | null; // null for jokers
  rank: CardRank;
  value: number;
  isJoker: boolean;
}

// Player types
export interface Player {
  id: string;
  name: string;
  color: string;
  hand: Card[];
  pegs: Peg[];
  isHost?: boolean;
  isCurrentTurn?: boolean;
  isComplete?: boolean;
  teamId?: number;
}

// Peg types
export type PegLocation = 'start' | 'path' | 'castle' | 'home';

export interface Peg {
  id: string;
  playerId: string;
  location: PegLocation;
  position: number; // Position on the path or in the castle
}

// Game phase types
export type GamePhase = 'setup' | 'colorSelection' | 'playing' | 'gameOver';

// Game state
export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  deck: Card[];
  discardPile: Card[];
  phase: GamePhase;
  winner: string | null;
  isShuffling: boolean;
  lastMove?: {
    playerId: string;
    cardId: string;
    pegId: string;
    fromPosition: number;
    toPosition: number;
  };
}

// Multiplayer types
export interface Room {
  id: string;
  code: string;
  host: string;
  players: Player[];
}

export interface MultiplayerState {
  isOnline: boolean;
  roomId: string | null;
  roomCode: string | null;
  playerId: string | null;
  isHost: boolean;
}

// Move types
export interface MoveData {
  playerId: string;
  cardId: string;
  pegId: string;
  fromPosition: number;
  toPosition: number;
}

// Card action types
export type CardAction = 
  | 'move' 
  | 'split' 
  | 'reverse' 
  | 'bump' 
  | 'enterPath' 
  | 'enterCastle';

export interface CardActionData {
  type: CardAction;
  card: Card;
  peg?: Peg;
  secondPeg?: Peg; // For split moves
  targetPosition?: number;
  targetPeg?: Peg; // For bump actions
}

// Game settings
export interface GameSettings {
  playerCount: number;
  teamMode: boolean;
  teams?: {
    [playerId: string]: number; // Maps player IDs to team numbers
  };
} 