import React, { useState, useEffect } from 'react';
import { useMultiplayer, MultiplayerPlayer } from '../../context/MultiplayerContext';
import { GameState, createInitialGameState, GamePhase } from '../../models/GameState';
import { createBoard, BoardSpace, SpaceType } from '../../models/BoardModel';
import { Card, Rank, Suit } from '../../models/Card';
import { CardSuit, CardRank } from '../../types/gameTypes';
import GameController from '../Game/GameController';
import './MultiplayerStyles.css';

// Improved component to show waiting for player's turn with appropriate messaging
const PlayerTurnOverlay: React.FC<{ 
  playerName: string; 
  isLocalPlayer: boolean;
}> = ({ playerName, isLocalPlayer }) => {
  return (
    <div className="player-waiting-overlay">
      <div className="player-waiting-message">
        <h3>{playerName}'s turn<span className="loading-dots"></span></h3>
        {!isLocalPlayer && <p>Waiting for their move</p>}
        {isLocalPlayer && <p>Your turn now!</p>}
      </div>
    </div>
  );
};

interface MultiplayerGameControllerProps {
  onBack: () => void;
}

const MultiplayerGameController: React.FC<MultiplayerGameControllerProps> = ({ onBack }) => {
  const { 
    isOnlineMode,
    isHost,
    roomId,
    roomCode,
    playerId, 
    players, 
    isGameStarted,
    clearError,
    createRoom,
    joinRoom,
    startGame,
    updatePlayerColor,
    leaveRoom,
    socket
  } = useMultiplayer();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isCurrentPlayerTurn, setIsCurrentPlayerTurn] = useState<boolean>(false);
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string>('');
  const [isShufflingDone, setIsShufflingDone] = useState<boolean>(false);
  const [isColorSelectionDone, setIsColorSelectionDone] = useState<boolean>(false);
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [gamePhase, setGamePhase] = useState<'setup' | 'colorSelection' | 'shuffling' | 'playing'>('colorSelection');
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});
  const [gameControllerKey, setGameControllerKey] = useState<number>(0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState<number>(0);

  // Convert multiplayer players to game format
  const playerNames = players.map((p: MultiplayerPlayer) => p.name);

  // Create player teams (each player in their own team for simplicity)
  const playerTeams: Record<string, number> = {};
  players.forEach((player: MultiplayerPlayer, index: number) => {
    playerTeams[player.id] = index;
  });

  // Create player colors from selected colors
  const playerColors: Record<string, string> = selectedColors;

  // Register socket event listeners properly
  useEffect(() => {
    if (!isOnlineMode || !socket) return;

    // Set up event listeners for socket events
    const onGameStateUpdate = (updatedGameState: GameState) => {
      console.log("🔄 Received game state update:", {
        currentPlayer: updatedGameState.players[updatedGameState.currentPlayerIndex]?.name,
        phase: updatedGameState.phase,
        myId: playerId
      });
      
      // Check if game state is valid
      if (!updatedGameState || !updatedGameState.players) {
        console.error("❌ Invalid game state received:", updatedGameState);
        return;
      }
      
      // Simple flag to check if it's this player's turn
      const isMyTurn = updatedGameState.players[updatedGameState.currentPlayerIndex]?.id === playerId;
      console.log(`👤 Turn status: ${isMyTurn ? "It's MY turn" : "It's NOT my turn"}`);
      
      // Set key game state variables
      setGameState(updatedGameState);
      setCurrentTurnPlayer(updatedGameState.players[updatedGameState.currentPlayerIndex]?.name || '');
      setIsCurrentPlayerTurn(isMyTurn);
      
      // Force a complete re-render of the GameController by updating the key
      // This ensures the controller fully reinitializes with the new state
      setGameControllerKey(prev => prev + 1);
    };

    // Handle moves from other players
    const onPlayerMove = (data: any) => {
        console.log('📣 Received player move:', data);
        
        if (!data || !data.playerId || !gameState) {
            console.error('❌ Invalid move data received:', data);
            return;
        }
        
        // Is this move from another player?
        const isOtherPlayerMove = data.playerId !== playerId;
        console.log(`🎮 Move from ${isOtherPlayerMove ? 'another' : 'this'} player`);
        
        // Apply the move to our local game state
        try {
            // Clone the current game state to avoid direct mutations
            const updatedGameState = JSON.parse(JSON.stringify(gameState));
            
            // Apply the move data (card played, peg moved, etc.)
            // This would need to be implemented based on your game logic
            if (data.cardId && data.pegId && data.toPosition !== undefined) {
                console.log(`🎲 Processing move: Card ${data.cardId} to move peg ${data.pegId} to position ${data.toPosition}`);
                
                // Update the game state here based on the move
                // This is a simplified example:
                // 1. Find the peg and update its position
                // 2. Remove the card from player's hand
                
                // After applying the move, update the game state
                setGameState(updatedGameState);
                
                // Force a complete re-render of the GameController component
                setGameControllerKey(prev => prev + 1);
            }
        } catch (error) {
            console.error('❌ Error applying move:', error);
        }
    };

    // Handle shuffled cards
    const onShuffledCards = (data: any) => {
      console.log('🃏 Received shuffled cards data:', data);
      
      try {
        const gameState = data.gameState;
        
        if (!gameState || !gameState.players) {
          console.error('❌ Invalid game state received from shuffle:', gameState);
          return;
        }
        
        console.log(`🎲 Game started with ${gameState.players.length} players`);
        
        // Add board validation logging
        if (gameState.board) {
          const spacesCount = gameState.board.allSpaces instanceof Map 
            ? gameState.board.allSpaces.size 
            : Object.keys(gameState.board.allSpaces || {}).length;
          
          console.log(`📋 Board validation: ${spacesCount} spaces, ${gameState.board.sections?.length || 0} sections`);
          
          // Check for starting space
          let foundStartingSpace = false;
          if (gameState.board.allSpaces instanceof Map) {
            for (const [id, space] of gameState.board.allSpaces.entries()) {
              if (space.type === 'starting' || id.includes('_starting')) {
                console.log(`🎯 Found starting space ${id} with ${space.pegs?.length || 0} pegs`);
                foundStartingSpace = true;
                break;
              }
            }
          } else {
            for (const id in gameState.board.allSpaces) {
              const space = gameState.board.allSpaces[id];
              if (space.type === 'starting' || id.includes('_starting')) {
                console.log(`🎯 Found starting space ${id} with ${space.pegs?.length || 0} pegs`);
                foundStartingSpace = true;
                break;
              }
            }
          }
          
          if (!foundStartingSpace) {
            console.warn('⚠️ No starting space found in board!');
          }
        } else {
          console.error('❌ No board found in game state!');
        }
        
        // Check player details
        gameState.players.forEach((player: any) => {
          console.log(`🎮 Player ${player.name} has ${player.hand?.length || 0} cards and ${player.pegs?.length || 0} pegs`);
        });
        
        // Update our local state
        setGameState(gameState);
        setGamePhase('playing');
        
        // Set the current player 
        setCurrentPlayerIndex(gameState.currentPlayerIndex);
        setCurrentTurnPlayer(gameState.players[gameState.currentPlayerIndex]?.name || '');
        
        // Check if it's our turn
        const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === playerId;
        setIsCurrentPlayerTurn(isMyTurn);
        
        console.log(`👤 Initial turn: ${isMyTurn ? "It's MY turn" : "It's NOT my turn"}`);
        
        // Force a rerender of the GameController
        setGameControllerKey(prev => prev + 1);
      } catch (error) {
        console.error('❌ Error processing shuffled cards:', error);
      }
    };

    // Handle color update - THIS IS THE KEY FIX
    const onPlayerColorUpdate = (data: { playerId: string, color: string }) => {
      console.log('Player color updated received:', data);
      
      // Update the selected colors directly
      setSelectedColors(prev => ({
        ...prev,
        [data.playerId]: data.color
      }));
    };

    // Handle game phase change
    const onGamePhaseChange = (data: { phase: 'setup' | 'colorSelection' | 'shuffling' | 'playing' }) => {
      setGamePhase(data.phase);
    };

    // Set up event listeners
    socket.on('game-state-updated', onGameStateUpdate);
    socket.on('player-move', onPlayerMove);
    socket.on('shuffled-cards', onShuffledCards);
    socket.on('player-color-updated', onPlayerColorUpdate);
    socket.on('game-phase-changed', onGamePhaseChange);
    
    // For debugging only - uncomment if needed
    // socket.onAny((event, ...args) => {
    //   console.log(`🔌 Socket event: ${event}`, args);
    // });
    
    return () => {
      // Clean up event listeners
      socket.off('game-state-updated', onGameStateUpdate);
      socket.off('player-move', onPlayerMove);
      socket.off('shuffled-cards', onShuffledCards);
      socket.off('player-color-updated', onPlayerColorUpdate);
      socket.off('game-phase-changed', onGamePhaseChange);
      // socket.offAny();
    };
  }, [isOnlineMode, playerId, socket]);

  // This effect checks when all players have selected colors
  useEffect(() => {
    if (players.length > 0 && Object.keys(selectedColors).length > 0) {
      // Check if all players have selected colors
      const allPlayersHaveColors = players.every(
        (player: MultiplayerPlayer) => selectedColors[player.id]
      );
      
      setIsColorSelectionDone(allPlayersHaveColors);
      console.log('Color selection status:', {
        selectedColors,
        allPlayersHaveColors,
        players: players.map(p => p.id)
      });
    }
  }, [players, selectedColors]);

  // Update game state on the server
  const updateGameState = (newGameState: GameState) => {
    if (!isOnlineMode || !roomId) return;
    sendGameStateUpdate(newGameState);
    setGameState(newGameState);
  };

  // Handle player making a move
  const handleMove = (moveData: any) => {
    if (!socket || !roomId || !playerId || !isCurrentPlayerTurn) {
      console.error('❌ Cannot make move: not connected or not your turn');
      return;
    }
    
    console.log('🎮 Handling move:', moveData);
    
    // Add current player ID to the move data
    const playerMoveData = {
      ...moveData,
      playerId
    };
    
    // Send the move to the server
    socket.emit('player-move', {
      roomId,
      moveData: playerMoveData
    }, (response: any) => {
      if (response && response.success) {
        console.log('✅ Move successfully sent to server');
      } else {
        console.error('❌ Error sending move to server:', response?.error);
      }
    });
  };

  // Handle color selection
  const handleColorSelect = async (color: string) => {
    if (!isOnlineMode || !roomId) return;
    
    try {
      // Update color in the server
      await updatePlayerColor(color);
      
      // Update local state
      setSelectedColors(prev => ({
        ...prev,
        [playerId!]: color
      }));
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  };

  // Handle card shuffling (host only)
  const handleShuffleDeck = (deckState: any) => {
    if (!isOnlineMode || !roomId || !isHost) return;
    
    // Generate a properly shuffled deck
    const shuffledDeck = generateShuffledDeck();
    
    // Create a simplified player ID map to ensure consistent ID formats
    const playerIdMap: Record<string, string> = {};
    players.forEach((player, index) => {
      // Create simple sequential IDs (player-1, player-2, etc.)
      // Only add to map if id is not null
      if (player.id) {
        playerIdMap[player.id] = `player-${index + 1}`;
      }
    });
    
    // Log the ID mapping for debugging
    console.log("Player ID mapping:", playerIdMap);
    
    // Create a complete initial game state
    const initialGameState: GameState = {
      id: `game-${Date.now()}`, // Generate a unique ID for this game
      players: players.map((player, index) => {
        // Draw 5 cards from the shuffled deck for each player's hand
        const hand = shuffledDeck.splice(0, 5);
        
        // Use the simplified player ID from the map
        const simplifiedId = playerIdMap[player.id];
        
        return {
          id: simplifiedId, // Use simplified ID format (player-1, player-2, etc.)
          name: player.name,
          color: selectedColors[player.id] || '#CCCCCC',
          hand: hand,
          // Create pegs as string IDs to match the Player interface (1-indexed to match server)
          pegs: [
            `${simplifiedId}-peg-1`,
            `${simplifiedId}-peg-2`,
            `${simplifiedId}-peg-3`,
            `${simplifiedId}-peg-4`,
            `${simplifiedId}-peg-5`
          ],
          isHost: playerId && player.id === playerId && isHost,
          isComplete: false,
          teamId: 0
        };
      }),
      currentPlayerIndex: 0, // Start with the first player (usually the host)
      phase: 'playing',
      // Create a basic board for the game
      board: createBoard(
        `board-${Date.now()}`, 
        players.length,
        // Map colors using simplified player IDs to match the format expected by the board
        players.reduce((colors, player, index) => {
          // Use both formats to ensure compatibility
          const simplifiedId = playerIdMap[player.id];
          const hyphenId = `player-${index+1}`; // Format: player-1
          const underscoreId = `player_${index+1}`; // Format: player_1
          
          // Add all three formats to ensure the board renders correctly
          colors[simplifiedId] = selectedColors[player.id] || '#CCCCCC';
          colors[hyphenId] = selectedColors[player.id] || '#CCCCCC';
          colors[underscoreId] = selectedColors[player.id] || '#CCCCCC';
          
          return colors;
        }, {} as Record<string, string>)
      ),
      drawPile: shuffledDeck, // Remaining cards after dealing to players
      discardPile: [],
      moves: [], // Initialize with no moves
      winner: undefined
    };
    
    // Store the player ID mapping in state for turn comparison later
    setPlayerIdMap(playerIdMap);
    
    console.log("Initial game state created:", initialGameState);
    setGameState(initialGameState);
    setIsShufflingDone(true);
    setGamePhase('playing');
    
    // Send the complete game state to the server
    shuffleCards(initialGameState);
  };

  // Function to proceed to the game after color selection
  const handleProceedToGame = () => {
    if (!isOnlineMode || !roomId || !isHost) return;
    
    // Change the game phase to shuffling
    setGamePhase('shuffling');
    
    // Emit an event for all players to go to the shuffling phase
    if (socket) {
      socket.emit('change-game-phase', { roomId, phase: 'shuffling' });
    }
    
    // Create an initial game state
    const initialGameState: GameState = {
      id: roomId,
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        color: selectedColors[p.id] || '#CCCCCC', // Default gray if no color selected
        hand: [],
        pegs: [
          `${p.id}-peg-1`,
          `${p.id}-peg-2`,
          `${p.id}-peg-3`,
          `${p.id}-peg-4`,
          `${p.id}-peg-5`
        ],
        isHost: p.id === playerId,
        isCurrentTurn: p.id === players[0].id, // First player's turn by default
        isComplete: false, // Required by Player type
        teamId: 0 // Default team ID
      })),
      currentPlayerIndex: 0,
      phase: 'shuffle' as GamePhase,
      board: createBoard(
        roomId, 
        players.length, 
        // Create a proper mapping of player indexes to colors
        players.reduce((colorMap, player, index) => {
          colorMap[index] = selectedColors[player.id] || '#CCCCCC';
          return colorMap;
        }, {} as Record<number, string>)
      ),
      drawPile: [], // Will be populated during shuffling
      discardPile: [],
      moves: [],
      winner: undefined // Use undefined instead of null
    };
    
    // Update local state
    setGameState(initialGameState);
    
    // Set the current player
    const firstPlayer = players[0];
    setCurrentTurnPlayer(firstPlayer.name);
    setIsCurrentPlayerTurn(firstPlayer.id === playerId);
    
    // Update game state for all players
    sendGameStateUpdate(initialGameState);
    
    // Automatically trigger shuffling after a short delay
    setTimeout(() => {
      // Generate shuffled deck
      const shuffledDeck = generateShuffledDeck();
      
      // Update the game state with the shuffled deck
      const gameStateWithDeck = {
        ...initialGameState,
        drawPile: shuffledDeck,
        phase: 'playing' as GamePhase
      };
      
      // Set the local state
      setGameState(gameStateWithDeck);
      
      // Shuffle the cards and deal them
      handleShuffleDeck(gameStateWithDeck);
    }, 1000);
  };

  const generateShuffledDeck = (): Card[] => {
    // Create a standard deck of 52 cards + 2 jokers
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Record<string, Rank> = {
      'A': 'ace',
      '2': '2',
      '3': '3',
      '4': '4',
      '5': '5',
      '6': '6',
      '7': '7',
      '8': '8',
      '9': '9',
      '10': '10',
      'J': 'jack',
      'Q': 'queen',
      'K': 'king'
    };
    
    // Create all cards
    const cards: Card[] = [];
    
    // Regular cards
    for (let suitIndex = 0; suitIndex < suits.length; suitIndex++) {
      const suit = suits[suitIndex];
      for (let rankIndex = 0; rankIndex < Object.keys(ranks).length; rankIndex++) {
        const shortRank = Object.keys(ranks)[rankIndex];
        const rank = ranks[shortRank];
        const value = rankIndex + 1; // A=1, 2=2, ..., K=13
        const isFace = rank === 'jack' || rank === 'queen' || rank === 'king';
        
        cards.push({
          id: `${rank}-${suit}-${Date.now()}-${Math.random()}`,
          suit,
          rank,
          value,
          isFace
        });
      }
    }
    
    // Add jokers
    cards.push({
      id: `joker-1-${Date.now()}-${Math.random()}`,
      suit: 'none',
      rank: 'joker',
      value: 0,
      isFace: false
    });
    
    cards.push({
      id: `joker-2-${Date.now()}-${Math.random()}`,
      suit: 'none',
      rank: 'joker',
      value: 0,
      isFace: false
    });
    
    // Shuffle the cards
    return cards.sort(() => Math.random() - 0.5);
  };

  const handleLeaveGame = () => {
    leaveRoom();
    onBack();
  };

  // Render color selection screen
  const renderColorSelection = () => {
    const PLAYER_COLORS = [
      { name: 'Red', value: '#FF5733' },
      { name: 'Blue', value: '#33A1FF' },
      { name: 'Green', value: '#33FF57' },
      { name: 'Purple', value: '#F033FF' },
      { name: 'Yellow', value: '#FFFF33' },
      { name: 'Pink', value: '#FF33A8' },
      { name: 'Cyan', value: '#33FFEC' },
      { name: 'Orange', value: '#FF8C33' }
    ];

    // Filter out colors that are already selected by other players
    const availableColors = PLAYER_COLORS.filter(
      color => !Object.values(selectedColors).includes(color.value) || 
               (playerId && selectedColors[playerId] === color.value)
    );

    // Check if all players have selected a color
    const allPlayersHaveColors = players.every(
      (player: MultiplayerPlayer) => selectedColors[player.id]
    );

    // Check if the current player has selected a color
    const hasSelectedColor = playerId && selectedColors[playerId];

    // Count how many players have selected colors
    const playersWithColors = players.filter(
      (player: MultiplayerPlayer) => selectedColors[player.id]
    ).length;

    return (
      <div className="color-selection-screen">
        <h2>Choose Your Color</h2>
        
        {/* Player color selection status */}
        <div className="player-color-status">
          <h3>Player Colors:</h3>
          <ul>
            {players.map((player: MultiplayerPlayer) => (
              <li key={player.id} className={player.id === playerId ? 'current-player' : ''}>
                {player.name}
                {player.id === playerId && ' (You)'}
                {selectedColors[player.id] ? (
                  <span>
                    <span 
                      className="player-color-indicator" 
                      style={{ backgroundColor: selectedColors[player.id] }}
                    ></span>
                    selected {PLAYER_COLORS.find(c => c.value === selectedColors[player.id])?.name}
                  </span>
                ) : (
                  <span className="waiting-selection">selecting...</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Color selection */}
        {!hasSelectedColor ? (
          <>
            <h3>Select your color:</h3>
            <div className="color-options">
              {availableColors.map(color => (
                <button
                  key={color.name}
                  className={`color-option ${playerId && selectedColors[playerId] === color.value ? 'selected' : ''}`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => handleColorSelect(color.value)}
                >
                  {color.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="selected-color-message">
            <p>You selected <span style={{ color: selectedColors[playerId] }}>{PLAYER_COLORS.find(c => c.value === selectedColors[playerId])?.name}</span></p>
          </div>
        )}
        
        {/* Game status messaging */}
        <div className="color-selection-status">
          <p>
            {playersWithColors === players.length 
              ? "All players have selected colors!" 
              : `Waiting for players to select colors... (${playersWithColors}/${players.length})`}
          </p>
        </div>
        
        {/* Start game button for host */}
        {isHost && (
          <div className="proceed-container">
            <button 
              className="skeuomorphic-button primary-button"
              onClick={handleProceedToGame}
              disabled={!allPlayersHaveColors}
            >
              <span className="button-text">Start the Game</span>
              <div className="button-shine"></div>
            </button>
            {!allPlayersHaveColors && (
              <p className="button-hint">Waiting for all players to select colors...</p>
            )}
          </div>
        )}
        
        {/* Message for non-host players */}
        {!isHost && allPlayersHaveColors && (
          <p className="helper-text">All players have selected colors. Waiting for the host to start the game...</p>
        )}
      </div>
    );
  };

  // Define functions not provided directly by the context
  const sendGameStateUpdate = (gameState: GameState) => {
    // Implementation will depend on your socket service
    console.log('Sending game state update:', gameState);
    // You would typically emit an event to your socket server here
    if (socket) {
      socket.emit('update-game-state', { roomId, gameState });
    }
  };
  
  const shuffleCards = (deckState: any) => {
    console.log('🃏 Host is shuffling cards...');
    
    // Create proper player colors mapping for the board
    const playerColorMapping: Record<string, string> = {};
    players.forEach((p, index) => {
      // Use both formats to ensure compatibility: player_1 format for board, player-ID for game state
      playerColorMapping[`player_${index+1}`] = p.color;
      playerColorMapping[p.id] = p.color;
    });
    
    // Create a board with the correct number of sections
    const gameBoard = createBoard(
      `board_${Date.now()}`, 
      players.length, 
      playerColorMapping
    );
    
    // Create peg objects for each player
    const playerPegs: Record<string, any[]> = {};
    players.forEach(p => {
      playerPegs[p.id] = Array(5).fill(0).map((_, i) => ({
        id: `${p.id}-peg-${i+1}`,
        playerId: p.id,
        location: 'start',
        position: 0
      }));
    });
    
    // Find the starting space
    let startingSpace: BoardSpace | null = null;
    
    // Convert to array to avoid iterator issues
    const spacesArray = Array.from(gameBoard.allSpaces.entries());
    
    for (const [id, space] of spacesArray) {
      if (space.type === 'starting' || id.includes('_starting')) {
        startingSpace = space;
        break;
      }
    }
    
    // If no starting space, create one with the proper type
    if (!startingSpace) {
      startingSpace = {
        id: 'starting_circle',
        type: 'starting' as SpaceType, // Cast as SpaceType
        x: 700,
        y: 700,
        index: -1,
        label: 'Start',
        pegs: [],
        sectionIndex: 0
      };
      gameBoard.allSpaces.set(startingSpace.id, startingSpace);
    }
    
    // Initialize pegs array if it doesn't exist
    if (!startingSpace.pegs) {
      startingSpace.pegs = [];
    }
    
    // Place all pegs on the starting space
    players.forEach(p => {
      const playerPegIds = playerPegs[p.id].map(peg => peg.id);
      startingSpace!.pegs.push(...playerPegIds); // Non-null assertion
    });
    
    console.log(`Initial starting space has ${startingSpace.pegs.length} pegs`);
    
    // Create a shuffled deck
    const deck = generateShuffledDeck();
    
    // Deal 5 cards to each player
    const playerHands: Record<string, any[]> = {};
    players.forEach(p => {
      playerHands[p.id] = deck.splice(0, 5);
    });
    
    // Create a complete initial game state with proper player setup
    const initialGameState = {
      id: `game_${Date.now()}`,
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        hand: playerHands[p.id],
        pegs: playerPegs[p.id]
      })),
      currentPlayerIndex: 0,
      phase: 'playing',
      board: {
        ...gameBoard,
        // Convert Map to plain object for serialization
        allSpaces: Object.fromEntries(gameBoard.allSpaces)
      },
      drawPile: deck,
      discardPile: [],
      moves: []
    };
    
    console.log('📤 Sending initial game state to server:', initialGameState);
    console.log('Board sections:', initialGameState.board.sections.length);
    console.log('Board spaces:', Object.keys(initialGameState.board.allSpaces).length);
    console.log('Starting space pegs:', startingSpace.pegs.length);
    
    if (socket) {
      // Send the complete game state update
      socket.emit('shuffle-cards', { 
        roomId, 
        deckState: initialGameState 
      });
      
      // Change local phase to indicate we're sending data
      setGamePhase('playing');
    }
  };

  // Debug info
  useEffect(() => {
    if (gameState && gamePhase === 'playing') {
      console.log("Game players:", gameState.players);
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const currentPlayer = gameState.players[currentPlayerIndex];
      
      // Add null check for playerId
      const mappedPlayerId = playerId && playerIdMap[playerId] ? playerIdMap[playerId] : playerId;
      
      console.log("Current game state:", {
        phase: gamePhase,
        currentPlayerIndex,
        currentPlayer: currentPlayer ? {
          id: currentPlayer.id,
          name: currentPlayer.name,
          isHost: (currentPlayer as any).isHost
        } : null,
        localPlayerId: playerId,
        mappedPlayerId,
        playerIdMap,
        isCurrentPlayerTurn: !!(currentPlayer && mappedPlayerId && currentPlayer.id === mappedPlayerId)
      });
    }
  }, [gameState, gamePhase, playerId, playerIdMap]);

  // Debug effect to log game state changes
  useEffect(() => {
    if (gameState) {
      console.log('🎲 Game state changed:', {
        phase: gameState.phase,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentPlayer: gameState.players?.[gameState.currentPlayerIndex]?.name || 'unknown',
        playerCount: gameState.players?.length || 0,
        drawPileSize: gameState.drawPile?.length || 0,
        discardPileSize: gameState.discardPile?.length || 0,
        isLocalPlayerTurn: gameState.players?.[gameState.currentPlayerIndex]?.id === 
          (playerId && playerIdMap[playerId] ? playerIdMap[playerId] : playerId)
      });
    }
  }, [gameState, playerId, playerIdMap]);

  // Render the appropriate content based on game phase
  const renderGameContent = () => {
    if (gamePhase === 'colorSelection') {
      return renderColorSelection();
    }
    
    if (gamePhase === 'shuffling') {
      return (
        <div className="shuffling-screen">
          <h2>Shuffling cards...</h2>
          <div className="loading-spinner"></div>
          <p>The host is preparing the game.</p>
        </div>
      );
    }
    
    if (gameState && gameState.players && gameState.players.length > 0) {
      const currentPlayerIndex = gameState.currentPlayerIndex || 0;
      const currentPlayer = gameState.players[currentPlayerIndex];
      
      // Use the playerIdMap to match the current format with the stored format
      // Add null check for playerId
      const mappedPlayerId = playerId && playerIdMap[playerId] ? playerIdMap[playerId] : playerId;
      // Ensure isCurrentPlayerTurn is always a boolean
      const isCurrentPlayerTurn: boolean = !!(currentPlayer && mappedPlayerId && currentPlayer.id === mappedPlayerId);
      
      console.log('🎮 Rendering game with current player turn:', {
        currentPlayerIndex,
        isCurrentPlayerTurn,
        myId: playerId
      });
      
      console.log("Turn information:", {
        currentPlayerIndex,
        currentPlayerId: currentPlayer?.id,
        localPlayerId: playerId,
        mappedPlayerId: mappedPlayerId,
        isCurrentPlayerTurn
      });
      
      return (
        <div className="multiplayer-game-container">
          <div className="game-header">
            <div className="room-info">
              <span className="room-code">Room: {roomCode}</span>
              {isHost && <span className="host-badge">Host</span>}
            </div>
            <div className="player-list">
              {gameState.players.map((player, index) => (
                <li key={player.id} className={currentPlayerIndex === index ? 'current-player' : ''}>
                  {player.name} 
                  <span 
                    className="selected-color" 
                    style={{backgroundColor: player.color}}
                  ></span>
                  {currentPlayerIndex === index && ' (Current Turn)'}
                </li>
              ))}
            </div>
          </div>
          
          {!isCurrentPlayerTurn && (
            <div className="player-waiting-overlay">
              <div className="player-waiting-message">
                <h3>Waiting for {currentTurnPlayer}'s turn</h3>
                <p>Please wait while the other player makes their move<span className="loading-dots"></span></p>
              </div>
            </div>
          )}
          
          <GameController 
            key={gameControllerKey}
            playerNames={gameState.players.map(p => p.name)}
            playerTeams={{}}
            numBoardSections={gameState.players.length}
            playerColors={gameState.players.reduce((colors, p) => ({...colors, [p.id]: p.color}), {})}
            isMultiplayer={true}
            isCurrentPlayerTurn={isCurrentPlayerTurn}
            onMove={handleMove}
            onUpdateGameState={updateGameState}
            gameStateOverride={gameState}
          />
          
          <button className="leave-game-button" onClick={handleLeaveGame}>
            Leave Game
          </button>
        </div>
      );
    }
    
    return (
      <div className="loading-screen">
        <h2>Loading game...</h2>
        <div className="loading-spinner"></div>
      </div>
    );
  };

  return (
    <div className="multiplayer-game-controller">
      {renderGameContent()}
    </div>
  );
};

export default MultiplayerGameController;