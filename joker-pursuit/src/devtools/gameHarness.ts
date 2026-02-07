import { BoardSpace } from '../models/BoardModel';
import { Card, Rank, Suit } from '../models/Card';
import { GameState, Move } from '../models/GameState';

export type HarnessMode = 'offline' | 'online';

export interface HarnessCardInput {
  id?: string;
  rank: string;
  suit?: string;
  value?: number;
  isFace?: boolean;
}

export interface HarnessMoveOptions {
  direction?: 'forward' | 'backward';
  steps?: number;
  isSecondMove?: boolean;
  firstMovePegId?: string;
}

export interface HarnessActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  value?: T;
}

export interface HarnessSnapshot {
  mode: HarnessMode;
  timestamp: number;
  gameState: GameState;
  currentPlayerId?: string;
  selectedCardId?: string | null;
  selectedPegId?: string | null;
  selectableSpaceIds?: string[];
  selectablePegIds?: string[];
  promptMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface JokerPursuitHarnessApi {
  version: string;
  mode: HarnessMode;
  getSnapshot: () => HarnessSnapshot;
  replaceGameState: (state: GameState) => HarnessActionResult;
  setCurrentPlayer: (playerId: string) => HarnessActionResult;
  setPlayerHand: (playerId: string, cards: HarnessCardInput[]) => HarnessActionResult;
  placePeg: (pegId: string, spaceId: string) => HarnessActionResult;
  setPegPositions: (placements: Record<string, string>) => HarnessActionResult;
  listPossibleMoves: (
    playerId: string,
    cardId: string,
    options?: HarnessMoveOptions
  ) => HarnessActionResult<Move[]>;
  selectPeg: (pegId: string) => HarnessActionResult;
  selectSpace: (spaceId: string) => HarnessActionResult;
  applyMove: (move: Move) => HarnessActionResult<GameState>;
  selectCard: (cardId: string | null) => HarnessActionResult;
  clearInteraction: () => HarnessActionResult;
  setDevFlags: (
    flags: Partial<{ devMode: boolean; movePegsMode: boolean; preservePlayMode: boolean }>
  ) => HarnessActionResult;
  autoPlaySingleTurn: () => HarnessActionResult<{
    action: 'play_move' | 'discard_hand' | 'game_over';
    playerId: string;
    cardId?: string;
    pegId?: string;
    destination?: string;
  }>;
  syncToServer?: () => Promise<HarnessActionResult>;
  commitGameStateToServer?: (state?: GameState) => Promise<HarnessActionResult>;
}

const RANK_ALIASES: Record<string, Rank> = {
  a: 'ace',
  ace: 'ace',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  j: 'jack',
  jack: 'jack',
  q: 'queen',
  queen: 'queen',
  k: 'king',
  king: 'king',
  joker: 'joker'
};

const SUIT_ALIASES: Record<string, Suit> = {
  h: 'hearts',
  hearts: 'hearts',
  heart: 'hearts',
  d: 'diamonds',
  diamonds: 'diamonds',
  diamond: 'diamonds',
  c: 'clubs',
  clubs: 'clubs',
  club: 'clubs',
  s: 'spades',
  spades: 'spades',
  spade: 'spades',
  none: 'none'
};

const toRank = (value: string): Rank => {
  const normalized = value.trim().toLowerCase();
  return RANK_ALIASES[normalized] ?? 'joker';
};

const toSuit = (value: string | undefined, rank: Rank): Suit => {
  if (rank === 'joker') {
    return 'none';
  }

  if (!value) {
    return 'hearts';
  }

  const normalized = value.trim().toLowerCase();
  return SUIT_ALIASES[normalized] ?? 'hearts';
};

const cardValueForRank = (rank: Rank): number => {
  if (rank === 'ace') {
    return 1;
  }

  if (rank === 'joker') {
    return 0;
  }

  if (rank === 'jack' || rank === 'queen' || rank === 'king') {
    return 10;
  }

  return Number(rank);
};

const isFaceRank = (rank: Rank): boolean => {
  return rank === 'jack' || rank === 'queen' || rank === 'king';
};

export const serializeGameState = (state: GameState): GameState => {
  if (!state?.board?.allSpaces || !(state.board.allSpaces instanceof Map)) {
    return state;
  }

  return {
    ...state,
    board: {
      ...state.board,
      allSpaces: Object.fromEntries(state.board.allSpaces)
    } as unknown as GameState['board']
  };
};

export const normalizeGameState = (state: GameState): GameState => {
  if (!state?.board?.allSpaces || state.board.allSpaces instanceof Map) {
    return state;
  }

  return {
    ...state,
    board: {
      ...state.board,
      allSpaces: new Map(Object.entries(state.board.allSpaces as Record<string, BoardSpace>))
    } as GameState['board']
  };
};

export const cloneGameState = (state: GameState): GameState => {
  return normalizeGameState(JSON.parse(JSON.stringify(serializeGameState(state))) as GameState);
};

const findPlayerIndex = (state: GameState, playerId: string): number => {
  return state.players.findIndex(player => player.id === playerId);
};

export const createCardFromInput = (input: HarnessCardInput, index: number): Card => {
  const rank = toRank(input.rank);
  const suit = toSuit(input.suit, rank);

  return {
    id: input.id || `harness-${rank}-${suit}-${Date.now()}-${index}`,
    rank,
    suit,
    value: input.value ?? cardValueForRank(rank),
    isFace: input.isFace ?? isFaceRank(rank)
  };
};

export const setCurrentPlayerById = (state: GameState, playerId: string): HarnessActionResult<GameState> => {
  const nextState = cloneGameState(state);
  const playerIndex = findPlayerIndex(nextState, playerId);

  if (playerIndex === -1) {
    return {
      ok: false,
      error: `Player ${playerId} does not exist.`
    };
  }

  nextState.currentPlayerIndex = playerIndex;
  return {
    ok: true,
    value: nextState
  };
};

export const setPlayerHandById = (
  state: GameState,
  playerId: string,
  cards: HarnessCardInput[]
): HarnessActionResult<GameState> => {
  const nextState = cloneGameState(state);
  const player = nextState.players.find(entry => entry.id === playerId);

  if (!player) {
    return {
      ok: false,
      error: `Player ${playerId} does not exist.`
    };
  }

  player.hand = cards.map((card, index) => createCardFromInput(card, index));
  return {
    ok: true,
    value: nextState
  };
};

const getAllSpaces = (state: GameState): BoardSpace[] => {
  if (!state?.board?.allSpaces) {
    return [];
  }

  if (state.board.allSpaces instanceof Map) {
    return Array.from(state.board.allSpaces.values());
  }

  return Object.values(state.board.allSpaces);
};

const removePegFromAllSpaces = (state: GameState, pegId: string) => {
  getAllSpaces(state).forEach(space => {
    space.pegs = (space.pegs || []).filter(existingPegId => existingPegId !== pegId);
  });
};

export const placePegOnBoard = (
  state: GameState,
  pegId: string,
  destinationSpaceId: string
): HarnessActionResult<GameState> => {
  const nextState = cloneGameState(state);
  const destination = nextState.board.allSpaces.get(destinationSpaceId);

  if (!destination) {
    return {
      ok: false,
      error: `Space ${destinationSpaceId} does not exist.`
    };
  }

  removePegFromAllSpaces(nextState, pegId);

  if (!destination.pegs.includes(pegId)) {
    destination.pegs.push(pegId);
  }

  return {
    ok: true,
    value: nextState
  };
};

export const setPegPositionsOnBoard = (
  state: GameState,
  placements: Record<string, string>
): HarnessActionResult<GameState> => {
  const nextState = cloneGameState(state);

  for (const [pegId, destinationSpaceId] of Object.entries(placements)) {
    const destination = nextState.board.allSpaces.get(destinationSpaceId);
    if (!destination) {
      return {
        ok: false,
        error: `Space ${destinationSpaceId} does not exist.`
      };
    }

    removePegFromAllSpaces(nextState, pegId);

    if (!destination.pegs.includes(pegId)) {
      destination.pegs.push(pegId);
    }
  }

  return {
    ok: true,
    value: nextState
  };
};

export const getPegLocations = (state: GameState): Record<string, string> => {
  const locations: Record<string, string> = {};

  getAllSpaces(state).forEach(space => {
    (space.pegs || []).forEach(pegId => {
      locations[pegId] = space.id;
    });
  });

  return locations;
};

declare global {
  interface Window {
    __JP_HARNESS__?: JokerPursuitHarnessApi;
  }
}
