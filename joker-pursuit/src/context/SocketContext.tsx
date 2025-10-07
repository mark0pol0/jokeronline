import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode
} from 'react';
import socketIOClient from 'socket.io-client';

// Define event data types
interface DebugMessage {
  message: string;
  [key: string]: any;
}

// Define the shape of our context
interface SocketContextType {
  socket: ReturnType<typeof socketIOClient> | null;
  isConnected: boolean;
  serverUrl: string;
  connectionError: string | null;
  updateServerUrl: (url: string) => void;
  reconnect: () => void;
}

const STORAGE_KEY = 'joker-pursuit.server-url';
const DEFAULT_LOCAL_URL = 'http://localhost:8080';
const MISSING_PRODUCTION_SERVER_ERROR =
  'No multiplayer server is configured. Add REACT_APP_SOCKET_URL or use "Configure server" to connect when you are ready.';

const ensureProtocol = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
};

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getInitialServerUrl = (): string => {
  const envUrl = process.env.REACT_APP_SOCKET_URL?.trim();

  if (typeof window === 'undefined') {
    return envUrl || DEFAULT_LOCAL_URL;
  }

  try {
    const storedUrl = window.localStorage.getItem(STORAGE_KEY);
    if (storedUrl) {
      return storedUrl;
    }
  } catch (error) {
    console.error('Failed to read stored server url', error);
  }

  if (envUrl) {
    return envUrl;
  }

  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return DEFAULT_LOCAL_URL;
  }

  // In hosted environments (e.g. Vercel) we wait until the user provides a
  // backend URL so the page can render without any socket attempts.
  return '';
};

const normalizeServerUrl = (value: string): string => {
  const withProtocol = ensureProtocol(value);
  if (!withProtocol) {
    return '';
  }

  return stripTrailingSlash(withProtocol);
};

// Create the context with default values
const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  serverUrl: DEFAULT_LOCAL_URL,
  connectionError: null,
  updateServerUrl: () => {},
  reconnect: () => {}
});

// Create a provider component
interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const initialUrl = useMemo(() => getInitialServerUrl(), []);
  const [socket, setSocket] = useState<ReturnType<typeof socketIOClient> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(initialUrl);
  const [shouldConnect, setShouldConnect] = useState<boolean>(() => Boolean(normalizeServerUrl(initialUrl)));
  const [refreshToken, setRefreshToken] = useState(0);
  const activeConnectionId = useRef(0);

  const updateServerUrl = useCallback((url: string) => {
    const normalized = normalizeServerUrl(url);
    setServerUrl(normalized);
    setShouldConnect(Boolean(normalized));

    if (typeof window !== 'undefined') {
      try {
        if (normalized) {
          window.localStorage.setItem(STORAGE_KEY, normalized);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        console.error('Failed to persist server url', error);
      }
    }
  }, []);

  const reconnect = useCallback(() => {
    const normalized = normalizeServerUrl(serverUrl);

    if (!normalized) {
      setShouldConnect(false);
      setConnectionError(MISSING_PRODUCTION_SERVER_ERROR);
      setSocket(null);
      setIsConnected(false);
      return;
    }

    setShouldConnect(true);
    setConnectionError(null);
    setRefreshToken(prev => prev + 1);
  }, [serverUrl]);

  useEffect(() => {
    const connectionId = activeConnectionId.current + 1;
    activeConnectionId.current = connectionId;
    const url = normalizeServerUrl(serverUrl);

    if (!shouldConnect || !url) {
      if (!url) {
        console.warn('Socket server URL is not configured. Skipping connection attempt.');
      }

      setSocket(null);
      setIsConnected(false);
      setConnectionError(shouldConnect && !url ? MISSING_PRODUCTION_SERVER_ERROR : null);
      return undefined;
    }

    console.log('Creating socket connection to:', url);

    // Create socket instance
    const socketInstance = socketIOClient(url, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 15000,
      transports: ['websocket', 'polling']
    });

    const handleConnect = () => {
      console.log('Socket connected with ID:', socketInstance.id);
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    };

    const handleError = (error: Error) => {
      console.error('Socket connection error:', error);
      setConnectionError(error.message || 'Unable to connect to server');
      setIsConnected(false);
    };

    // Set up event listeners
    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('connect_error', handleError);
    socketInstance.io.on('error', handleError);

    socketInstance.on('debug', (data: DebugMessage) => {
      console.log('Debug message from server:', data);
    });

    // Save the socket instance
    setSocket(socketInstance);

    // Clean up on unmount or url change
    return () => {
      console.log('Cleaning up socket connection');
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.off('connect_error', handleError);
      socketInstance.io.off('error', handleError);
      socketInstance.disconnect();

      // prevent stale socket being referenced
      if (activeConnectionId.current === connectionId) {
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, [serverUrl, refreshToken, shouldConnect]);

  const contextValue = useMemo(() => ({
    socket,
    isConnected,
    serverUrl,
    connectionError,
    updateServerUrl,
    reconnect
  }), [socket, isConnected, serverUrl, connectionError, updateServerUrl, reconnect]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext);
