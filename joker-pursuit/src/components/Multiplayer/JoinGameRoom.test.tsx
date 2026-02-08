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
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows join form for invite links when room state is stale', () => {
    mockMultiplayerState({
      roomCode: 'ABC123',
      sessionToken: null,
      playerId: null,
      players: [{ id: 'host-1', name: 'Host', color: '' }]
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
      players: [
        { id: 'host-1', name: 'Host', color: '' },
        { id: 'player-2', name: 'Guest', color: '' }
      ]
    });

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" />);

    expect(screen.queryByTestId('join-room-player-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('join-room-code')).toHaveTextContent('ABC123');
  });
});
