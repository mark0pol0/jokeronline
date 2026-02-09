import React from 'react';
import { render, screen } from '@testing-library/react';
import CreateGameRoom from './CreateGameRoom';
import { useMultiplayer } from '../../context/MultiplayerContext';

jest.mock('../../context/MultiplayerContext', () => ({
  useMultiplayer: jest.fn()
}));

const mockedUseMultiplayer = useMultiplayer as jest.MockedFunction<typeof useMultiplayer>;

const mockMultiplayerState = (overrides: Record<string, unknown> = {}) => {
  mockedUseMultiplayer.mockReturnValue({
    isOnlineMode: true,
    isHost: true,
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

describe('CreateGameRoom', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows create room form before room creation', () => {
    mockMultiplayerState();

    render(<CreateGameRoom onBack={jest.fn()} />);

    expect(screen.getByTestId('create-room-player-name')).toBeInTheDocument();
    expect(screen.queryByTestId('create-room-code')).not.toBeInTheDocument();
  });

  test('shows waiting room roster with host and presence badges', () => {
    mockMultiplayerState({
      roomCode: 'ABC123',
      playerId: 'host-1',
      hostPlayerId: 'host-1',
      playersPresence: {
        'host-1': { playerId: 'host-1', status: 'connected', connected: true },
        'guest-1': { playerId: 'guest-1', status: 'reconnecting', connected: false }
      },
      players: [
        { id: 'host-1', name: 'Host Player', color: '#FF5733' },
        { id: 'guest-1', name: 'Guest Player', color: '#33A1FF' }
      ]
    });

    render(<CreateGameRoom onBack={jest.fn()} />);

    expect(screen.getByTestId('create-room-code')).toHaveTextContent('ABC123');
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });
});
