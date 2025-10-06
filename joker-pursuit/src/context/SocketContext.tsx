import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
}

// Create the context with default values
const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false
});

// Create a provider component
interface SocketProviderProps {
  children: ReactNode;
}

const resolveSocketUrl = () => {
  const envUrl = process.env.REACT_APP_SOCKET_URL?.trim();
  if (envUrl) {
    return envUrl;
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
    return inferred;
  }

  return 'http://localhost:8080';
};

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<ReturnType<typeof socketIOClient> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize socket connection when component mounts
  useEffect(() => {
    const SOCKET_URL = resolveSocketUrl();
    console.log('Creating socket connection to:', SOCKET_URL);
    
    // Create socket instance
    const socketInstance = socketIOClient(SOCKET_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });
    
    // Set up event listeners
    socketInstance.on('connect', () => {
      console.log('Socket connected with ID:', socketInstance.id);
      setIsConnected(true);
    });
    
    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });
    
    socketInstance.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });
    
    socketInstance.on('debug', (data: DebugMessage) => {
      console.log('Debug message from server:', data);
    });
    
    // Save the socket instance
    setSocket(socketInstance);
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up socket connection');
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext); 