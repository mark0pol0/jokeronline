import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import JoinGameRoom from './JoinGameRoom';
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

describe('JoinGameRoom', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    mockSocketState();
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

  test('easy mode invite link shows simplified guest join form', () => {
    window.history.replaceState({}, '', '/?room=ABC123&name=Grandma');
    mockMultiplayerState({
      roomCode: null,
      sessionToken: null,
      playerId: null,
      players: []
    });

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" easyMode />);

    expect(screen.getByText('Join Family Game')).toBeInTheDocument();
    expect(screen.getByTestId('join-room-player-name')).toHaveValue('Grandma');
    expect(screen.getByTestId('join-room-code-input')).toHaveTextContent('ABC123');
    expect(screen.getByRole('button', { name: 'Join Game' })).toBeInTheDocument();
    expect(screen.queryByText('Configure server')).not.toBeInTheDocument();
  });

  test('easy mode hides advanced waiting room controls on the happy path', () => {
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

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" easyMode />);

    expect(screen.getByTestId('join-room-easy-confirmation')).toHaveTextContent("You're in");
    expect(screen.getByText('Players in the game (2)')).toBeInTheDocument();
    expect(screen.queryByText('Copy My Return Link')).not.toBeInTheDocument();
    expect(screen.queryByText('Host')).not.toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });

  test('blocks join attempts until the socket is connected', () => {
    const joinRoom = jest.fn();
    mockSocketState({
      isConnected: false,
      serverUrl: 'https://jokeronline.onrender.com'
    });
    mockMultiplayerState({
      joinRoom
    });

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" />);

    fireEvent.change(screen.getByTestId('join-room-player-name'), {
      target: { value: 'Guest' }
    });
    fireEvent.click(screen.getByTestId('join-room-submit'));

    expect(screen.getByTestId('join-room-submit')).toBeDisabled();
    expect(screen.getByTestId('join-room-connection-gate')).toHaveTextContent('Connecting to the multiplayer server');
    expect(joinRoom).not.toHaveBeenCalled();
  });

  test('easy mode reveals troubleshooting when disconnected', () => {
    mockSocketState({
      isConnected: false,
      serverUrl: 'https://jokeronline.onrender.com',
      connectionError: 'websocket error'
    });
    mockMultiplayerState();

    render(<JoinGameRoom onBack={jest.fn()} initialRoomCode="ABC123" easyMode />);

    expect(screen.getByText('Connection problem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Server Settings' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('join-room-submit')).toBeDisabled();
  });
});
