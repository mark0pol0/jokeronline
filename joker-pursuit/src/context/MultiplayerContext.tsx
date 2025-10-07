import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import socketIOClient from 'socket.io-client';
import { useSocket } from './SocketContext';

// Types for multiplayer state
export interface MultiplayerPlayer {
  id: string;
  name: string;
  color: string;
}

interface CreateRoomResponse {
  success: boolean;
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  players?: MultiplayerPlayer[];
  error?: string;
}

interface JoinRoomResponse {
  success: boolean;
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  players?: MultiplayerPlayer[];
  error?: string;
}

interface StartGameResponse {
  success: boolean;
  error?: string;
}

interface UpdateColorResponse {
  success: boolean;
  error?: string;
}

interface MultiplayerContextType {
  isOnlineMode: boolean;
  isHost: boolean;
  roomId: string | null;
  roomCode: string | null;
  playerId: string | null;
  players: MultiplayerPlayer[];
  isGameStarted: boolean;
  error: string | null;
  socket: ReturnType<typeof socketIOClient> | null;
  
  // Actions
  setOnlineMode: (isOnline: boolean) => void;
  createRoom: (playerName: string) => Promise<void>;
  joinRoom: (roomCode: string, playerName: string) => Promise<void>;
  startGame: () => Promise<void>;
  updatePlayerColor: (color: string) => Promise<void>;
  leaveRoom: () => void;
  clearError: () => void;
}

// Create context with default values
const MultiplayerContext = createContext<MultiplayerContextType>({
  isOnlineMode: false,
  isHost: false,
  roomId: null,
  roomCode: null,
  playerId: null,
  players: [],
  isGameStarted: false,
  error: null,
  socket: null,
  
  setOnlineMode: () => {},
  createRoom: async () => {},
  joinRoom: async () => {},
  startGame: async () => {},
  updatePlayerColor: async () => {},
  leaveRoom: () => {},
  clearError: () => {}
});

interface MultiplayerProviderProps {
  children: ReactNode;
}

const CONNECTION_ERROR_PREFIX = 'Unable to reach the server';

export const MultiplayerProvider: React.FC<MultiplayerProviderProps> = ({ children }) => {
  const { socket, isConnected, serverUrl, connectionError } = useSocket();
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);
  
  // Surface connection level errors inside the multiplayer flow
  useEffect(() => {
    setError(prev => {
      if (connectionError) {
        const message = `${CONNECTION_ERROR_PREFIX} at ${serverUrl}. ${connectionError}`;
        return prev === message ? prev : message;
      }

      if (isConnected && prev && prev.startsWith(CONNECTION_ERROR_PREFIX)) {
        return null;
      }

      return prev;
    });
  }, [connectionError, serverUrl, isConnected]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return;
    
    // Event handlers
    const onPlayerJoined = (data: { players: MultiplayerPlayer[] }) => {
      console.log('Player joined event:', data);
      setPlayers(data.players);
    };
    
    const onPlayerLeft = (data: { 
      playerId: string, 
      playerName: string, 
      players: MultiplayerPlayer[] 
    }) => {
      console.log('Player left event:', data);
      setPlayers(data.players);
    };
    
    const onNewHost = (data: { newHostId: string, newHostName: string }) => {
      console.log('New host event:', data);
      if (playerId === data.newHostId) {
        setIsHost(true);
      }
    };
    
    const onGameStarted = (data: { players: MultiplayerPlayer[] }) => {
      console.log('Game started event:', data);
      setIsGameStarted(true);
      setPlayers(data.players);
    };
    
    const onPlayerColorUpdated = (data: { playerId: string, color: string }) => {
      console.log('Player color updated event:', data);
      setPlayers(prev => 
        prev.map(p => 
          p.id === data.playerId 
            ? { ...p, color: data.color }
            : p
        )
      );
    };
    
    // Set up listeners
    socket.on('player-joined', onPlayerJoined);
    socket.on('player-left', onPlayerLeft);
    socket.on('new-host', onNewHost);
    socket.on('game-started', onGameStarted);
    socket.on('player-color-updated', onPlayerColorUpdated);
    
    // Clean up listeners on unmount
    return () => {
      socket.off('player-joined', onPlayerJoined);
      socket.off('player-left', onPlayerLeft);
      socket.off('new-host', onNewHost);
      socket.off('game-started', onGameStarted);
      socket.off('player-color-updated', onPlayerColorUpdated);
    };
  }, [socket, playerId]);

  // Function to create a new room
  const createRoom = async (playerName: string): Promise<void> => {
    if (!socket) {
      setError('Socket connection not available. Please try again later.');
      return Promise.reject(new Error('Socket not available'));
    }
    
    if (!isConnected) {
      setError('Not connected to server. Please verify the Socket.IO backend URL and try again.');
      return Promise.reject(new Error('Not connected to server'));
    }
    
    // Ensure online mode is enabled
    setIsOnlineMode(true);
    
    console.log('Creating room with player name:', playerName);
    console.log('Socket connected:', isConnected);
    console.log('Socket ID:', socket.id);
    
    return new Promise((resolve, reject) => {
      socket.emit('create-room', playerName, (response: CreateRoomResponse) => {
        console.log('Create room response:', response);
        
        if (response.success) {
          setRoomId(response.roomId || null);
          setRoomCode(response.roomCode || null);
          setPlayerId(response.playerId || null);
          setIsHost(true);
          
          // This just has the host player for now
          if (response.players) {
            setPlayers(response.players);
          }
          
          resolve();
        } else {
          setError(response.error || 'Failed to create room');
          reject(new Error(response.error || 'Failed to create room'));
        }
      });
    });
  };

  // Function to join an existing room
  const joinRoom = async (roomCode: string, playerName: string): Promise<void> => {
    if (!socket) {
      setError('Socket connection not available. Please try again later.');
      return Promise.reject(new Error('Socket not available'));
    }
    
    if (!isConnected) {
      setError('Not connected to server. Please verify the Socket.IO backend URL and try again.');
      return Promise.reject(new Error('Not connected to server'));
    }
    
    // Ensure online mode is enabled
    setIsOnlineMode(true);
    
    console.log(`Joining room with code: ${roomCode}, player name: ${playerName}`);
    
    return new Promise((resolve, reject) => {
      socket.emit('join-room', roomCode, playerName, (response: JoinRoomResponse) => {
        console.log('Join room response:', response);
        
        if (response.success) {
          setRoomId(response.roomId || null);
          setRoomCode(response.roomCode || null);
          setPlayerId(response.playerId || null);
          setIsHost(false);
          
          if (response.players) {
            setPlayers(response.players);
          }
          
          resolve();
        } else {
          setError(response.error || 'Failed to join room');
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  };

  // Function to start the game (host only)
  const startGame = async (): Promise<void> => {
    if (!socket) {
      setError('Socket connection not available. Please try again later.');
      return Promise.reject(new Error('Socket not available'));
    }
    
    if (!roomId) {
      setError('Room not found');
      return Promise.reject(new Error('Room not found'));
    }
    
    console.log(`Starting game in room ${roomId}`);
    
    return new Promise((resolve, reject) => {
      socket.emit('start-game', roomId, (response: StartGameResponse) => {
        console.log('Start game response:', response);
        
        if (response.success) {
          setIsGameStarted(true);
          resolve();
        } else {
          setError(response.error || 'Failed to start game');
          reject(new Error(response.error || 'Failed to start game'));
        }
      });
    });
  };

  // Function to update player color
  const updatePlayerColor = (color: string): Promise<void> => {
    if (!socket || !isConnected) {
      console.error('Cannot update color: Socket not connected');
      return Promise.reject(new Error('Socket not connected'));
    }

    if (!roomId || !playerId) {
      console.error('Cannot update color: Room data not available');
      return Promise.reject(new Error('Room data not available'));
    }

    console.log(`Updating player color to ${color}`);
    
    return new Promise((resolve, reject) => {
      socket.emit('update-player-color', {
        roomId,
        playerId,
        color
      }, (response: UpdateColorResponse) => {
        if (!response.success) {
          console.error('Failed to update player color:', response.error);
          reject(new Error(response.error || 'Failed to update player color'));
          return;
        }
        
        // Update local state
        setPlayers(prev => 
          prev.map(p => 
            p.id === playerId 
              ? { ...p, color }
              : p
          )
        );
        
        console.log('Player color updated successfully');
        resolve();
      });
    });
  };

  // Function to leave the current room
  const leaveRoom = () => {
    if (socket && roomId) {
      console.log(`Leaving room ${roomId}`);
      socket.emit('leave-room', roomId);
    }
    
    // Reset all state regardless of socket state
    setIsOnlineMode(false);
    setRoomId(null);
    setRoomCode(null);
    setPlayerId(null);
    setIsHost(false);
    setPlayers([]);
    setIsGameStarted(false);
    setError(null);
  };

  const contextValue: MultiplayerContextType = {
    isOnlineMode,
    isHost,
    roomId,
    roomCode,
    playerId,
    players,
    isGameStarted,
    error,
    socket,
    setOnlineMode: setIsOnlineMode,
    createRoom,
    joinRoom,
    startGame,
    updatePlayerColor,
    leaveRoom,
    clearError
  };

  return (
    <MultiplayerContext.Provider
      value={contextValue}
    >
      {children}
    </MultiplayerContext.Provider>
  );
};

// Custom hook to use the multiplayer context
export const useMultiplayer = () => useContext(MultiplayerContext); 