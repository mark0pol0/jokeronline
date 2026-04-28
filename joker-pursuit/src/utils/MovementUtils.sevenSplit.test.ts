import { Card } from '../models/Card';
import { createInitialGameState, GameState, Move } from '../models/GameState';
import { applyMove, getPossibleMoves } from './MovementUtils';

const makeCard = (id: string, rank: Card['rank'] = '7', suit: Card['suit'] = 'hearts'): Card => ({
  id,
  rank,
  suit,
  value: rank === 'joker' ? 0 : rank === 'jack' || rank === 'queen' || rank === 'king' ? 10 : parseInt(rank, 10),
  isFace: rank === 'jack' || rank === 'queen' || rank === 'king'
});

const placePeg = (state: GameState, pegId: string, spaceId: string) => {
  state.board.allSpaces.forEach(space => {
    space.pegs = space.pegs.filter(existingPegId => existingPegId !== pegId);
  });

  const destination = state.board.allSpaces.get(spaceId);
  if (!destination) {
    throw new Error(`Missing test destination ${spaceId}`);
  }

  destination.pegs.push(pegId);
};

const createSevenSplitState = () => {
  const state = createInitialGameState(
    ['Alice', 'Bob'],
    { 'player-1': 0, 'player-2': 1 },
    2,
    { 'player-1': '#ff0000', 'player-2': '#00ff00' }
  );
  state.phase = 'playing';

  const player = state.players[0];
  const seven = makeCard('seven-hearts');
  player.hand = [seven];
  state.drawPile = [];

  return { state, player, seven };
};

describe('seven split moves', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('preserves the remaining 6-step leg when a 1+6 split enters castle', () => {
    const { state, player, seven } = createSevenSplitState();
    const firstPegId = player.pegs[0];
    const secondPegId = player.pegs[1];

    placePeg(state, firstPegId, 'section1_0');
    placePeg(state, secondPegId, 'section1_2');

    const firstMove = getPossibleMoves(state, player.id, seven.id, { steps: 1 })
      .find(move => move.pegId === firstPegId && move.destinations.includes('section1_1'));

    expect(firstMove).toBeDefined();

    const { newState } = applyMove(state, {
      ...(firstMove as Move),
      metadata: {
        ...(firstMove as Move).metadata,
        sevenCardMove: {
          steps: 1,
          isFirstMove: true
        }
      }
    });

    const secondMoves = getPossibleMoves(newState, player.id, seven.id, {
      steps: 6,
      isSecondMove: true,
      firstMovePegId: firstPegId
    });

    expect(secondMoves.some(move => move.pegId === firstPegId)).toBe(false);

    const regularSixStepMove = secondMoves.find(move =>
      move.pegId === secondPegId &&
      move.destinations.includes('section1_entrance_2')
    );
    const castleSixStepMove = secondMoves.find(move =>
      move.pegId === secondPegId &&
      move.destinations.includes('section1_castle1_4')
    );

    expect(regularSixStepMove?.metadata?.sevenCardMove).toEqual({
      steps: 6,
      isFirstMove: false
    });
    expect(castleSixStepMove?.metadata?.sevenCardMove).toEqual({
      steps: 6,
      isFirstMove: false
    });
    expect(castleSixStepMove?.metadata?.castleMovement).toBe(true);
  });
});
