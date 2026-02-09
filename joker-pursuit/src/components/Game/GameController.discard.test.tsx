import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GameController from './GameController';
import { createInitialGameState } from '../../models/GameState';
import {
  setCurrentPlayerById,
  setPegPositionsOnBoard,
  setPlayerHandById
} from '../../devtools/gameHarness';

const PLAYER_NAMES = ['Mark', 'Tester'];
const PLAYER_TEAMS: Record<string, number> = {
  'player-1': 0,
  'player-2': 1
};
const PLAYER_COLORS: Record<string, string> = {
  'player-1': '#FF5733',
  'player-2': '#33A1FF'
};

const createDiscardEdgeCaseState = (withSecondTrackPeg: boolean) => {
  const initialState = createInitialGameState(
    PLAYER_NAMES,
    PLAYER_TEAMS,
    2,
    PLAYER_COLORS
  );

  const playingState = {
    ...initialState,
    phase: 'playing' as const
  };

  const currentPlayerResult = setCurrentPlayerById(playingState, 'player-1');
  if (!currentPlayerResult.ok || !currentPlayerResult.value) {
    throw new Error(currentPlayerResult.error || 'Failed to set current player.');
  }

  const placements: Record<string, string> = {
    'player-1-peg-1': 'section1_castle1_4',
    'player-1-peg-2': withSecondTrackPeg ? 'section1_9' : 'section1_home_0',
    'player-1-peg-3': 'section1_home_1',
    'player-1-peg-4': 'section1_home_2',
    'player-1-peg-5': 'section1_home_3',
    'player-2-peg-1': 'section2_home_0',
    'player-2-peg-2': 'section2_home_1',
    'player-2-peg-3': 'section2_home_2',
    'player-2-peg-4': 'section2_home_3',
    'player-2-peg-5': 'section2_home_4'
  };

  const placementResult = setPegPositionsOnBoard(currentPlayerResult.value, placements);
  if (!placementResult.ok || !placementResult.value) {
    throw new Error(placementResult.error || 'Failed to place pegs.');
  }

  const playerOneHandResult = setPlayerHandById(placementResult.value, 'player-1', [
    { id: 'p1-3c', rank: '3', suit: 'clubs' },
    { id: 'p1-4s', rank: '4', suit: 'spades' },
    { id: 'p1-7s', rank: '7', suit: 'spades' },
    { id: 'p1-2d', rank: '2', suit: 'diamonds' },
    { id: 'p1-9d', rank: '9', suit: 'diamonds' }
  ]);

  if (!playerOneHandResult.ok || !playerOneHandResult.value) {
    throw new Error(playerOneHandResult.error || 'Failed to set player one hand.');
  }

  const playerTwoHandResult = setPlayerHandById(playerOneHandResult.value, 'player-2', [
    { id: 'p2-2c', rank: '2', suit: 'clubs' },
    { id: 'p2-3c', rank: '3', suit: 'clubs' },
    { id: 'p2-4c', rank: '4', suit: 'clubs' },
    { id: 'p2-5c', rank: '5', suit: 'clubs' },
    { id: 'p2-6c', rank: '6', suit: 'clubs' }
  ]);

  if (!playerTwoHandResult.ok || !playerTwoHandResult.value) {
    throw new Error(playerTwoHandResult.error || 'Failed to set player two hand.');
  }

  return playerTwoHandResult.value;
};

const createSevenSplitCastlePromptState = () => {
  const initialState = createInitialGameState(
    PLAYER_NAMES,
    PLAYER_TEAMS,
    2,
    PLAYER_COLORS
  );

  const playingState = {
    ...initialState,
    phase: 'playing' as const
  };

  const currentPlayerResult = setCurrentPlayerById(playingState, 'player-1');
  if (!currentPlayerResult.ok || !currentPlayerResult.value) {
    throw new Error(currentPlayerResult.error || 'Failed to set current player.');
  }

  const placements: Record<string, string> = {
    'player-1-peg-1': 'section1_1',
    'player-1-peg-2': 'section1_home_0',
    'player-1-peg-3': 'section1_home_1',
    'player-1-peg-4': 'section1_home_2',
    'player-1-peg-5': 'section1_home_3',
    'player-2-peg-1': 'section2_home_0',
    'player-2-peg-2': 'section2_home_1',
    'player-2-peg-3': 'section2_home_2',
    'player-2-peg-4': 'section2_home_3',
    'player-2-peg-5': 'section2_home_4'
  };

  const placementResult = setPegPositionsOnBoard(currentPlayerResult.value, placements);
  if (!placementResult.ok || !placementResult.value) {
    throw new Error(placementResult.error || 'Failed to place pegs.');
  }

  const playerOneHandResult = setPlayerHandById(placementResult.value, 'player-1', [
    { id: 'p1-7s', rank: '7', suit: 'spades' },
    { id: 'p1-2d', rank: '2', suit: 'diamonds' },
    { id: 'p1-3c', rank: '3', suit: 'clubs' },
    { id: 'p1-4h', rank: '4', suit: 'hearts' },
    { id: 'p1-9d', rank: '9', suit: 'diamonds' }
  ]);

  if (!playerOneHandResult.ok || !playerOneHandResult.value) {
    throw new Error(playerOneHandResult.error || 'Failed to set player one hand.');
  }

  const playerTwoHandResult = setPlayerHandById(playerOneHandResult.value, 'player-2', [
    { id: 'p2-2c', rank: '2', suit: 'clubs' },
    { id: 'p2-3c', rank: '3', suit: 'clubs' },
    { id: 'p2-4c', rank: '4', suit: 'clubs' },
    { id: 'p2-5c', rank: '5', suit: 'clubs' },
    { id: 'p2-6c', rank: '6', suit: 'clubs' }
  ]);

  if (!playerTwoHandResult.ok || !playerTwoHandResult.value) {
    throw new Error(playerTwoHandResult.error || 'Failed to set player two hand.');
  }

  return playerTwoHandResult.value;
};

describe('GameController discard availability', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('shows discard when nine split has no legal second move', async () => {
    const edgeCaseState = createDiscardEdgeCaseState(false);

    render(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer
        isCurrentPlayerTurn
        localPlayerId="player-1"
        gameStateOverride={edgeCaseState}
      />
    );

    expect(await screen.findByRole('button', { name: /discard hand/i })).toBeInTheDocument();
  });

  test('hides discard when nine split can be completed by another peg', async () => {
    const playableState = createDiscardEdgeCaseState(true);

    render(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer
        isCurrentPlayerTurn
        localPlayerId="player-1"
        gameStateOverride={playableState}
      />
    );

    expect(screen.queryByRole('button', { name: /discard hand/i })).not.toBeInTheDocument();
  });

  test('prompts for castle entry on first half of seven split when both paths are legal', async () => {
    const gameState = createSevenSplitCastlePromptState();

    render(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer
        isCurrentPlayerTurn
        localPlayerId="player-1"
        gameStateOverride={gameState}
      />
    );

    fireEvent.click(screen.getByTestId('card-p1-7s'));
    fireEvent.click(screen.getByTestId('seven-option-split'));
    fireEvent.click(screen.getByTestId('seven-step-4'));
    fireEvent.click(screen.getByTestId('peg-player-1-peg-1'));

    expect(await screen.findByText(/Would you like this peg to go into your castle\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yes, enter castle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No, continue on board/i })).toBeInTheDocument();
  });
});
