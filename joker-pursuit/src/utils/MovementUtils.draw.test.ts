import { Card } from '../models/Card';
import { createInitialGameState, GameState, Move } from '../models/GameState';
import { applyMove, findSpaceForPeg } from './MovementUtils';

const makeCard = (id: string, rank: Card['rank'] = '5', suit: Card['suit'] = 'hearts'): Card => ({
  id,
  rank,
  suit,
  value: rank === 'joker' ? 0 : rank === 'jack' || rank === 'queen' || rank === 'king' ? 10 : parseInt(rank, 10),
  isFace: rank === 'jack' || rank === 'queen' || rank === 'king'
});

const createDrawTestState = (): { state: GameState; moveBase: Omit<Move, 'cardId'>; playerId: string } => {
  const state = createInitialGameState(
    ['Alice', 'Bob'],
    { 'player-1': 0, 'player-2': 1 },
    2,
    { 'player-1': '#ff0000', 'player-2': '#00ff00' }
  );
  state.phase = 'playing';

  const player = state.players[state.currentPlayerIndex];
  const pegId = player.pegs[0];
  const fromSpace = findSpaceForPeg(state, pegId);
  if (!fromSpace) {
    throw new Error('Expected to find source space for test peg.');
  }

  const destinationSpace = Array.from(state.board.allSpaces.values()).find(
    space =>
      (space.type === 'normal' || space.type === 'entrance' || space.type === 'corner') &&
      space.id !== fromSpace.id &&
      !space.pegs.some(existingPegId => existingPegId.startsWith(`${player.id}-peg-`))
  );

  if (!destinationSpace) {
    throw new Error('Expected to find empty destination space for test move.');
  }

  return {
    state,
    playerId: player.id,
    moveBase: {
      playerId: player.id,
      pegId,
      from: fromSpace.id,
      destinations: [destinationSpace.id]
    }
  };
};

describe('applyMove draw pile recycling', () => {
  test('reshuffles discard pile when draw pile is empty for a completed move', () => {
    const { state, moveBase, playerId } = createDrawTestState();
    const player = state.players.find(entry => entry.id === playerId)!;

    const playedCard = makeCard('played_card', '5');
    const discardCard1 = makeCard('discard_1', '2');
    const discardCard2 = makeCard('discard_2', '9');

    player.hand = [playedCard];
    state.drawPile = [];
    state.discardPile = [discardCard1, discardCard2];

    const { newState } = applyMove(state, {
      ...moveBase,
      cardId: playedCard.id
    });

    expect(newState.players[0].hand).toHaveLength(1);
    expect(newState.discardPile).toHaveLength(0);
    expect(newState.drawPile).toHaveLength(2);
    expect([playedCard.id, discardCard1.id, discardCard2.id]).toContain(newState.players[0].hand[0].id);
  });

  test('does not draw or reshuffle on first half of a split move', () => {
    const { state, moveBase, playerId } = createDrawTestState();
    const player = state.players.find(entry => entry.id === playerId)!;

    const splitCard = makeCard('split_card', '7');
    const discardCard = makeCard('discard_only', '10');

    player.hand = [splitCard];
    state.drawPile = [];
    state.discardPile = [discardCard];

    const { newState } = applyMove(state, {
      ...moveBase,
      cardId: splitCard.id,
      metadata: {
        sevenCardMove: {
          steps: 3,
          isFirstMove: true
        }
      }
    });

    expect(newState.players[0].hand).toHaveLength(1);
    expect(newState.players[0].hand[0].id).toBe(splitCard.id);
    expect(newState.drawPile).toHaveLength(0);
    expect(newState.discardPile).toHaveLength(1);
    expect(newState.discardPile[0].id).toBe(discardCard.id);
  });
});
