import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import socketIOClient from 'socket.io-client';

type SocketInstance = ReturnType<typeof socketIOClient>;

interface DebugMessage {
  message: string;
  [key: string]: unknown;
}

interface SocketContextType {
  socket: SocketInstance | null;
  isConnected: boolean;
  socketUrl: string;
  connectionError: string | null;
  setSocketUrl: (nextUrl: string) => void;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  socketUrl: 'http://localhost:8080',
  connectionError: null,
  setSocketUrl: () => undefined,
  reconnect: () => undefined
});

interface SocketProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'joker-pursuit:socket-url';

const resolveSocketUrl = (): string => {
  const envUrl = process.env.REACT_APP_SOCKET_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080';
    }

    const inferred = window.location.origin;
    console.warn(
      '[socket] Falling back to current origin for Socket.IO connection. Set REACT_APP_SOCKET_URL to your backend URL for production deployments.',
      { inferred }
    );
    return inferred.replace(/\/$/, '');
  }

  return 'http://localhost:8080';
};

const normaliseUrl = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return resolveSocketUrl();
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.pathname = '/';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    console.warn('[socket] Unable to parse provided URL. Reverting to default.', { candidate, error });
    return resolveSocketUrl();
  }
};

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<SocketInstance | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const initialUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return stored;
      }
    }
    return resolveSocketUrl();
  }, []);

  const [socketUrl, setSocketUrlState] = useState(initialUrl);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, socketUrl);
  }, [socketUrl]);

  useEffect(() => {
    const instance = socketIOClient(socketUrl, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    setSocket(instance);

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleConnectError = (error: Error) => {
      setIsConnected(false);
      setConnectionError(error.message || 'Unable to establish a Socket.IO connection.');
    };

    const handleDebug = (payload: DebugMessage) => {
      console.debug('[socket] Debug message from server', payload);
    };

    instance.on('connect', handleConnect);
    instance.on('disconnect', handleDisconnect);
    instance.on('connect_error', handleConnectError);
    instance.on('debug', handleDebug);

    return () => {
      instance.off('connect', handleConnect);
      instance.off('disconnect', handleDisconnect);
      instance.off('connect_error', handleConnectError);
      instance.off('debug', handleDebug);
      instance.disconnect();
      setSocket(null);
    };
  }, [socketUrl, connectionAttempt]);

  const setSocketUrl = useCallback((nextUrl: string) => {
    setSocketUrlState(normaliseUrl(nextUrl));
  }, []);

  const reconnect = useCallback(() => {
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  const contextValue = useMemo(
    () => ({ socket, isConnected, socketUrl, connectionError, setSocketUrl, reconnect }),
    [socket, isConnected, socketUrl, connectionError, setSocketUrl, reconnect]
  );

  return <SocketContext.Provider value={contextValue}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);

export type { SocketInstance };
