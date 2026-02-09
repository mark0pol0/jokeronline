import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GameController from './GameController';
import { createInitialGameState, shuffleAndDealCards } from '../../models/GameState';
import { cloneGameState } from '../../devtools/gameHarness';

const PLAYER_NAMES = ['Mark', 'Tester'];
const PLAYER_TEAMS: Record<string, number> = {
  'player-1': 0,
  'player-2': 1
};
const PLAYER_COLORS: Record<string, string> = {
  'player-1': '#FF5733',
  'player-2': '#33A1FF'
};

const createPlayingState = () => {
  const initial = createInitialGameState(PLAYER_NAMES, PLAYER_TEAMS, 2, PLAYER_COLORS);
  const dealt = shuffleAndDealCards(initial);
  dealt.phase = 'playing';
  return dealt;
};

describe('GameController multiplayer snapshot sync', () => {
  test('applies gameStateOverride updates without resetting zoom state', () => {
    const state = createPlayingState();
    const nextState = cloneGameState(state);
    nextState.currentPlayerIndex = 1;

    const onMove = jest.fn();
    const { rerender } = render(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer={true}
        isCurrentPlayerTurn={true}
        onMove={onMove}
        gameStateOverride={state}
        localPlayerId="player-1"
      />
    );

    expect(screen.getByText(/Mark's Turn/i)).toBeInTheDocument();
    expect(screen.getByText('120%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('144%')).toBeInTheDocument();

    rerender(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer={true}
        isCurrentPlayerTurn={false}
        onMove={onMove}
        gameStateOverride={nextState}
        localPlayerId="player-1"
      />
    );

    expect(screen.getByText(/Tester's Turn/i)).toBeInTheDocument();
    expect(screen.getByText('144%')).toBeInTheDocument();
  });

  test('clears transient card selection when snapshot override changes', () => {
    const state = createPlayingState();
    const nextState = cloneGameState(state);
    nextState.currentPlayerIndex = 1;

    const firstCardId = state.players[0].hand[0].id;
    const onMove = jest.fn();

    const { rerender } = render(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer={true}
        isCurrentPlayerTurn={true}
        onMove={onMove}
        gameStateOverride={state}
        localPlayerId="player-1"
      />
    );

    const firstCard = screen.getByTestId(`card-${firstCardId}`);
    fireEvent.click(firstCard);
    expect(firstCard).toHaveClass('selected');

    rerender(
      <GameController
        playerNames={PLAYER_NAMES}
        playerTeams={PLAYER_TEAMS}
        numBoardSections={2}
        playerColors={PLAYER_COLORS}
        isMultiplayer={true}
        isCurrentPlayerTurn={false}
        onMove={onMove}
        gameStateOverride={nextState}
        localPlayerId="player-1"
      />
    );

    expect(screen.getByTestId(`card-${firstCardId}`)).not.toHaveClass('selected');
  });
});
