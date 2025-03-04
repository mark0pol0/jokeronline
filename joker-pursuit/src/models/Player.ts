import { Card } from './Card';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  pegs: string[];
  isComplete: boolean;
  teamId: number;
  color?: string;
}

// Function to create a player with default values
export const createPlayer = (
  id: string,
  name: string,
  teamId: number,
  color?: string
): Player => {
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

// Check if a player has all pegs in their castle
export const isPlayerComplete = (player: Player, castleSpaces: Set<string>): boolean => {
  // This would check if all pegs are in castle spaces
  // We'll implement this as part of the board space tracking
  return player.isComplete;
};

// Check if a player has any legal moves with their current hand
export const hasLegalMoves = (player: Player): boolean => {
  // This would be a complex function that checks each card against the board state
  // We'll implement this later as part of the movement system
  return true; // Placeholder
}; 