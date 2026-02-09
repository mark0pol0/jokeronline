import React from 'react';
import { render, screen } from '@testing-library/react';
import JoinGameRoom from './JoinGameRoom';
import { useMultiplayer } from '../../context/MultiplayerContext';

jest.mock('../../context/MultiplayerContext', () => ({
  useMultiplayer: jest.fn()
}));

const mockedUseMultiplayer = useMultiplayer as jest.MockedFunction<typeof useMultiplayer>;

const mockMultiplayerState = (overrides: Record<string, unknown> = {}) => {
  mockedUseMultiplayer.mockReturnValue({
    isOnlineMode: true,
    isHost: false,
    hostPlayerId: null,
    roomId: null,
    roomCode: null,
    playerId: null,
    sessionToken: null,
    players: [],
    playersPresence: {},
    isGameStarted: false,
    isRejoining: false,
    stateVersion: 0,
    error: null,
    socket: null,
    setOnlineMode: jest.fn(),
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    startGame: jest.fn(),
    updatePlayerColor: jest.fn(),
    submitAction: jest.fn(),
    requestSync: jest.fn(),
    leaveRoom: jest.fn(),
    clearError: jest.fn(),
    ...overrides
  } as any);
};

describe('JoinGameRoom', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows join form for invite links when room state is stale', () => {
    mockMultiplayerState({
      roomCode: 'ABC123',
      sessionToken: null,
      playerId: null,
      players: [{ id: 'host-1', name: 'Host Player', color: '' }]
    });

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" />);

    expect(screen.getByTestId('join-room-player-name')).toBeInTheDocument();
    expect(screen.getByTestId('join-room-code-input')).toHaveValue('ABC123');
    expect(screen.queryByTestId('join-room-code')).not.toBeInTheDocument();
  });

  test('shows waiting room only after the current player is in the roster', () => {
    mockMultiplayerState({
      roomCode: 'ABC123',
      sessionToken: 'session-token',
      playerId: 'player-2',
      hostPlayerId: 'host-1',
      playersPresence: {
        'host-1': { playerId: 'host-1', status: 'connected', connected: true },
        'player-2': { playerId: 'player-2', status: 'connected', connected: true }
      },
      players: [
        { id: 'host-1', name: 'Host Player', color: '' },
        { id: 'player-2', name: 'Guest', color: '' }
      ]
    });

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" />);

    expect(screen.queryByTestId('join-room-player-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('join-room-code')).toHaveTextContent('ABC123');
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
  });

  test('prefills player name from URL query parameter', () => {
    window.history.replaceState({}, '', '/?room=ABC123&name=Player%20One');
    mockMultiplayerState({
      roomCode: null,
      sessionToken: null,
      playerId: null,
      players: []
    });

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" />);

    expect(screen.getByTestId('join-room-player-name')).toHaveValue('Player One');
  });
});
