import React from 'react';
import { act, render, screen } from '@testing-library/react';
import MultiplayerGameController from './MultiplayerGameController';
import { useMultiplayer } from '../../context/MultiplayerContext';
import { createBoard } from '../../models/BoardModel';
import { GameState } from '../../models/GameState';

jest.mock('../../context/MultiplayerContext', () => ({
  useMultiplayer: jest.fn()
}));

jest.mock('../Game/GameController', () => {
  return function MockGameController() {
    return <div data-testid="mock-game-controller">Game Controller</div>;
  };
});

const mockedUseMultiplayer = useMultiplayer as jest.MockedFunction<typeof useMultiplayer>;

type HandlerMap = Record<string, (payload: any) => void>;

const createMockSocket = () => {
  const handlers: HandlerMap = {};
  return {
    on: jest.fn((event: string, handler: (payload: any) => void) => {
      handlers[event] = handler;
    }),
    off: jest.fn((event: string) => {
      delete handlers[event];
    }),
    emitEvent: (event: string, payload: any) => {
      if (handlers[event]) {
        handlers[event](payload);
      }
    }
  };
};

const makePlayer = (id: string, name: string, color: string, teamId: number) => ({
  id,
  name,
  color,
  hand: [],
  pegs: [
    `${id}-peg-1`,
    `${id}-peg-2`,
    `${id}-peg-3`,
    `${id}-peg-4`,
    `${id}-peg-5`
  ],
  isComplete: false,
  teamId
});

const createSerializableGameState = (): GameState => {
  const players = [
    makePlayer('player-1', 'Host', '#FF5733', 0),
    makePlayer('player-2', 'Guest', '#33A1FF', 1)
  ];
  const playerColorsBySection = {
    player_1: '#FF5733',
    player_2: '#33A1FF'
  };
  const board = createBoard('board-test', players.length, playerColorsBySection);
  board.sections.forEach((section, index) => {
    section.playerIds = [players[index].id];
    section.color = players[index].color;
  });

  return {
    id: 'game-state-test',
    phase: 'playing',
    players,
    currentPlayerIndex: 0,
    board: {
      ...board,
      allSpaces: Object.fromEntries(board.allSpaces)
    } as unknown as GameState['board'],
    drawPile: [],
    discardPile: [],
    moves: []
  };
};

const mockMultiplayerState = (overrides: Record<string, unknown> = {}) => {
  const socket = createMockSocket();
  mockedUseMultiplayer.mockReturnValue({
    isOnlineMode: true,
    isHost: true,
    hostPlayerId: 'player-1',
    roomId: 'room-1',
    roomCode: 'ABCD12',
    playerId: 'player-1',
    sessionToken: 'session-token',
    players: [
      { id: 'player-1', name: 'Host', color: '#FF5733' },
      { id: 'player-2', name: 'Guest', color: '#33A1FF' }
    ],
    playersPresence: {
      'player-1': { playerId: 'player-1', status: 'connected', connected: true },
      'player-2': { playerId: 'player-2', status: 'reconnecting', connected: false }
    },
    isGameStarted: true,
    isRejoining: false,
    stateVersion: 1,
    error: null,
    socket: socket as any,
    setOnlineMode: jest.fn(),
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    startGame: jest.fn(),
    updatePlayerColor: jest.fn().mockResolvedValue(undefined),
    submitAction: jest.fn().mockResolvedValue(undefined),
    requestSync: jest.fn().mockResolvedValue(undefined),
    leaveRoom: jest.fn(),
    clearError: jest.fn(),
    ...overrides
  } as any);

  return socket;
};

describe('MultiplayerGameController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders role/presence chips and keeps leave action in header action group', () => {
    const socket = mockMultiplayerState();
    render(<MultiplayerGameController onBack={jest.fn()} />);

    act(() => {
      socket.emitEvent('room-snapshot-v2', {
        roomCode: 'ABCD12',
        stateVersion: 2,
        gameState: createSerializableGameState()
      });
    });

    expect(screen.getByText('Room')).toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Host', { selector: '.chip-badge.role-host' })).toBeInTheDocument();
    expect(screen.getByText('Turn')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();

    const leaveButton = screen.getByRole('button', { name: 'Leave Game' });
    expect(leaveButton.closest('.header-action-group')).not.toBeNull();
  });

  test('disables color swatches already claimed by other players', () => {
    mockMultiplayerState({
      players: [
        { id: 'player-1', name: 'Host', color: '#FF5733' },
        { id: 'player-2', name: 'Guest', color: '#33A1FF' }
      ],
      isGameStarted: false
    });

    render(<MultiplayerGameController onBack={jest.fn()} />);

    const redButton = screen.getByTestId('multiplayer-color-red');
    const blueButton = screen.getByTestId('multiplayer-color-blue');

    expect(redButton).not.toBeDisabled();
    expect(blueButton).toBeDisabled();
  });
});
