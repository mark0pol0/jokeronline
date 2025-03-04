import { Card } from './Card';
import { PegPosition } from './BoardModel';

export interface Player {
  id: string;
  name: string;
  color: string;
  hand: Card[];
  pegs: PegPosition[]; // Array of peg positions, always 5
  discarded: boolean; // Whether player has discarded this turn
  isComputer: boolean; // For AI players
  teamId: number; // Team identifier
  hasTurn: boolean; // Whether it's this player's turn
  isComplete: boolean; // Whether player has completed their castle
}

export const createPlayer = (
  id: string,
  name: string,
  color: string,
  teamId: number,
  isComputer: boolean = false
): Player => {
  return {
    id,
    name,
    color,
    hand: [],
    pegs: new Array(5).fill({ type: 'starting' }), // All pegs start in starting circle
    discarded: false,
    isComputer,
    teamId,
    hasTurn: false,
    isComplete: false
  };
};

// Check if a player has all pegs in their castle
export const isPlayerComplete = (player: Player): boolean => {
  return player.pegs.every(peg => peg.type === 'castle');
};

// Check if a player has any legal moves with their current hand
export const hasLegalMoves = (player: Player): boolean => {
  // This would be a complex function that checks each card against the board state
  // We'll implement this later as part of the movement system
  return true; // Placeholder
}; 