import socketIOClient from 'socket.io-client';
import { GameState } from '../models/GameState';

// Define the server URL based on environment
const SERVER_URL = process.env.NODE_ENV === 'production'
  ? 'https://your-production-url.com'
  : 'http://localhost:4001';

// Define types for callbacks and events
type CallbackFunction = (response: any) => void;
type EventHandler = (data: any) => void;

class SocketService {
  private socket: ReturnType<typeof socketIOClient> | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  // Initialize socket connection
  connect(): void {
    if (this.socket) return;

    this.socket = socketIOClient(SERVER_URL);
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });

    // Set up listeners for game events
    this.setupEventListeners();
  }

  // Disconnect socket
  disconnect(): void {
    if (!this.socket) return;
    
    this.socket.disconnect();
    this.socket = null;
    this.eventHandlers.clear();
  }

  // Set up listeners for all game events
  private setupEventListeners(): void {
    if (!this.socket) return;

    const events = [
      'player-joined',
      'game-started',
      'player-color-updated',
      'game-state-updated',
      'cards-shuffled',
      'move-made',
      'player-left',
      'new-host'
    ];

    events.forEach(event => {
      this.socket?.on(event, (data: any) => {
        this.triggerEventHandlers(event, data);
      });
    });
  }

  // Create a new game room
  createRoom(playerName: string, callback: CallbackFunction): void {
    if (!this.socket) {
      this.connect();
    }
    
    this.socket?.emit('create-room', playerName, callback);
  }

  // Join an existing game room
  joinRoom(roomCode: string, playerName: string, callback: CallbackFunction): void {
    if (!this.socket) {
      this.connect();
    }
    
    this.socket?.emit('join-room', roomCode, playerName, callback);
  }

  // Start the game (host only)
  startGame(roomId: string, callback: CallbackFunction): void {
    this.socket?.emit('start-game', roomId, callback);
  }

  // Update player color
  updatePlayerColor(roomId: string, playerId: string, color: string, callback: CallbackFunction): void {
    this.socket?.emit('update-player-color', roomId, playerId, color, callback);
  }

  // Update game state
  updateGameState(roomId: string, gameState: GameState): void {
    this.socket?.emit('update-game-state', roomId, gameState);
  }

  // Broadcast shuffled cards
  shuffleCards(roomId: string, deckState: any): void {
    this.socket?.emit('shuffle-cards', roomId, deckState);
  }

  // Send player move
  sendPlayerMove(roomId: string, moveData: any): void {
    this.socket?.emit('player-move', roomId, moveData);
  }

  // Add event handler
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    
    this.eventHandlers.get(event)?.push(handler);
  }

  // Remove event handler
  off(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) return;
    
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Trigger all handlers for an event
  private triggerEventHandlers(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  // Get socket ID
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // Check if socket is connected
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService; 