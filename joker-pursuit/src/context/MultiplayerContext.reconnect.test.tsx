import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MultiplayerProvider, useMultiplayer } from './MultiplayerContext';
import { useSocket } from './SocketContext';
import {
  createRoomV2,
  joinRoomV2,
  rejoinRoomV2
} from '../services/multiplayerProtocolV2';

jest.mock('./SocketContext', () => ({
  useSocket: jest.fn()
}));

jest.mock('../services/multiplayerProtocolV2', () => ({
  createRoomV2: jest.fn(),
  joinRoomV2: jest.fn(),
  rejoinRoomV2: jest.fn(),
  startGameV2: jest.fn(),
  updatePlayerColorV2: jest.fn(),
  submitActionV2: jest.fn(),
  requestSyncV2: jest.fn(),
  leaveRoomV2: jest.fn()
}));

const mockedUseSocket = useSocket as jest.MockedFunction<typeof useSocket>;
const mockedCreateRoomV2 = createRoomV2 as jest.MockedFunction<typeof createRoomV2>;
const mockedJoinRoomV2 = joinRoomV2 as jest.MockedFunction<typeof joinRoomV2>;
const mockedRejoinRoomV2 = rejoinRoomV2 as jest.MockedFunction<typeof rejoinRoomV2>;

type Handler = (payload?: any) => void;

const createMockSocket = (id: string) => {
  const handlers: Record<string, Handler> = {};
  return {
    id,
    on: jest.fn((event: string, handler: Handler) => {
      handlers[event] = handler;
    }),
    off: jest.fn((event: string) => {
      delete handlers[event];
    }),
    emit: jest.fn(),
    emitEvent: (event: string, payload?: any) => {
      if (handlers[event]) {
        handlers[event](payload);
      }
    }
  } as any;
};

const sessionKey = (roomCode: string) => `joker-pursuit.session.${roomCode.toUpperCase()}`;

let contextValue: ReturnType<typeof useMultiplayer> | null = null;
let socketContextState: ReturnType<typeof useSocket>;

const ContextProbe: React.FC = () => {
  contextValue = useMultiplayer();
  return <div data-testid="multiplayer-error">{contextValue.error || ''}</div>;
};

describe('MultiplayerContext reconnect behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
    window.localStorage.clear();
    contextValue = null;

    const socket = createMockSocket('socket-1');
    socketContextState = {
      socket,
      isConnected: true,
      serverUrl: 'https://socket.example.com',
      connectionError: null,
      updateServerUrl: jest.fn(),
      reconnect: jest.fn()
    };
    mockedUseSocket.mockImplementation(() => socketContextState);
  });

  test('createRoom writes canonical room URL while preserving unrelated query params', async () => {
    window.history.replaceState({}, '', '/?foo=bar');
    mockedCreateRoomV2.mockResolvedValue({
      success: true,
      roomId: 'room-1',
      roomCode: 'ABC123',
      playerId: 'player-1',
      sessionToken: 'token-1',
      players: [{ id: 'player-1', name: 'Host Player', color: '' }],
      stateVersion: 1,
      isHost: true
    });

    render(
      <MultiplayerProvider>
        <ContextProbe />
      </MultiplayerProvider>
    );

    await act(async () => {
      await contextValue!.createRoom('Host Player');
    });

    const searchParams = new URLSearchParams(window.location.search);
    expect(searchParams.get('foo')).toBe('bar');
    expect(searchParams.get('room')).toBe('ABC123');
    expect(searchParams.get('name')).toBe('Host Player');
    expect(window.sessionStorage.getItem(sessionKey('ABC123'))).toContain('token-1');
  });

  test('joinRoom writes canonical room URL and stores session identity', async () => {
    mockedJoinRoomV2.mockResolvedValue({
      success: true,
      roomId: 'room-join',
      roomCode: 'ROOM42',
      playerId: 'player-join',
      sessionToken: 'token-join',
      players: [{ id: 'player-join', name: 'Guest Player', color: '' }],
      stateVersion: 2,
      isHost: false
    });

    render(
      <MultiplayerProvider>
        <ContextProbe />
      </MultiplayerProvider>
    );

    await act(async () => {
      await contextValue!.joinRoom('room42', 'Guest Player');
    });

    const searchParams = new URLSearchParams(window.location.search);
    expect(searchParams.get('room')).toBe('ROOM42');
    expect(searchParams.get('name')).toBe('Guest Player');
    expect(window.sessionStorage.getItem(sessionKey('ROOM42'))).toContain('token-join');
  });

  test('rebinds session exactly once when socket id changes', async () => {
    const storedPayload = JSON.stringify({
      roomCode: 'ABCD12',
      sessionToken: 'token-rejoin',
      playerId: 'player-1'
    });
    window.history.replaceState({}, '', '/?room=ABCD12');
    window.sessionStorage.setItem(sessionKey('ABCD12'), storedPayload);

    mockedRejoinRoomV2.mockResolvedValue({
      success: true,
      roomId: 'room-1',
      roomCode: 'ABCD12',
      playerId: 'player-1',
      sessionToken: 'token-rejoin',
      players: [{ id: 'player-1', name: 'Host', color: '' }],
      stateVersion: 4,
      isHost: true,
      isGameStarted: true
    });

    const view = render(
      <MultiplayerProvider>
        <ContextProbe />
      </MultiplayerProvider>
    );

    await waitFor(() => {
      expect(mockedRejoinRoomV2).toHaveBeenCalledTimes(1);
    });

    socketContextState = {
      ...socketContextState,
      socket: createMockSocket('socket-2')
    };

    view.rerender(
      <MultiplayerProvider>
        <ContextProbe />
      </MultiplayerProvider>
    );

    await waitFor(() => {
      expect(mockedRejoinRoomV2).toHaveBeenCalledTimes(2);
    });
  });

  test('clears stored session and shows actionable error on terminal rejoin failure', async () => {
    const storedPayload = JSON.stringify({
      roomCode: 'ABCD12',
      sessionToken: 'token-rejoin',
      playerId: 'player-1'
    });
    window.history.replaceState({}, '', '/?room=ABCD12');
    window.sessionStorage.setItem(sessionKey('ABCD12'), storedPayload);
    mockedRejoinRoomV2.mockRejectedValue(new Error('Reconnect grace period expired.'));

    render(
      <MultiplayerProvider>
        <ContextProbe />
      </MultiplayerProvider>
    );

    await waitFor(() => {
      expect(mockedRejoinRoomV2).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('multiplayer-error')).toHaveTextContent(
        'Session expired, enter your name to rejoin if seats are open.'
      );
    });

    expect(window.sessionStorage.getItem(sessionKey('ABCD12'))).toBeNull();
  });
});
