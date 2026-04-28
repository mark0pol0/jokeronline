import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CreateGameRoom from './CreateGameRoom';
import { useMultiplayer } from '../../context/MultiplayerContext';
import { useSocket } from '../../context/SocketContext';

jest.mock('../../context/MultiplayerContext', () => ({
  useMultiplayer: jest.fn()
}));

jest.mock('../../context/SocketContext', () => ({
  useSocket: jest.fn()
}));

const mockedUseMultiplayer = useMultiplayer as jest.MockedFunction<typeof useMultiplayer>;
const mockedUseSocket = useSocket as jest.MockedFunction<typeof useSocket>;

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

const mockSocketState = (overrides: Record<string, unknown> = {}) => {
  mockedUseSocket.mockReturnValue({
    socket: null,
    isConnected: true,
    serverUrl: 'https://jokeronline.onrender.com',
    connectionError: null,
    updateServerUrl: jest.fn(),
    reconnect: jest.fn(),
    ...overrides
  } as any);
};

describe('CreateGameRoom', () => {
  beforeEach(() => {
    mockSocketState();
  });

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
    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  test('easy mode simplifies host waiting room happy path', () => {
    mockMultiplayerState({
      roomCode: 'ABC123',
      playerId: 'host-1',
      hostPlayerId: 'host-1',
      playersPresence: {
        'host-1': { playerId: 'host-1', status: 'connected', connected: true },
        'guest-1': { playerId: 'guest-1', status: 'connected', connected: true }
      },
      players: [
        { id: 'host-1', name: 'Host Player', color: '#FF5733' },
        { id: 'guest-1', name: 'Guest Player', color: '#33A1FF' }
      ]
    });

    render(<CreateGameRoom onBack={jest.fn()} easyMode />);

    expect(screen.getByText('Start Family Game')).toBeInTheDocument();
    expect(screen.getByTestId('create-room-code')).toHaveTextContent('ABC123');
    expect(screen.getByRole('button', { name: 'Copy Invite' })).toBeInTheDocument();
    expect(screen.queryByText('Copy My Return Link')).not.toBeInTheDocument();
    expect(screen.getByText('Players in the game (2)')).toBeInTheDocument();
    expect(screen.queryByText('Host')).not.toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });

  test('blocks create attempts until the socket is connected', () => {
    const createRoom = jest.fn();
    mockSocketState({
      isConnected: false,
      serverUrl: 'https://jokeronline.onrender.com'
    });
    mockMultiplayerState({ createRoom });

    render(<CreateGameRoom onBack={jest.fn()} />);

    fireEvent.change(screen.getByTestId('create-room-player-name'), {
      target: { value: 'Host' }
    });
    fireEvent.click(screen.getByTestId('create-room-submit'));

    expect(screen.getByTestId('create-room-submit')).toBeDisabled();
    expect(screen.getByTestId('create-room-connection-gate')).toHaveTextContent('Connecting to the multiplayer server');
    expect(createRoom).not.toHaveBeenCalled();
  });
});
