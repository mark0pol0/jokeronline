import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayer, MultiplayerPlayer } from '../../context/MultiplayerContext';
import { GameState } from '../../models/GameState';
import { createBoard } from '../../models/BoardModel';
import { Card, Rank, Suit } from '../../models/Card';
import GameController from '../Game/GameController';
import './MultiplayerStyles.css';

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
    updatePlayerColor,
    leaveRoom,
    socket
  } = useMultiplayer();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const [isCurrentPlayerTurn, setIsCurrentPlayerTurn] = useState<boolean>(false);
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string>('');
  const [isColorSelectionDone, setIsColorSelectionDone] = useState<boolean>(false);
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [gamePhase, setGamePhase] = useState<'setup' | 'colorSelection' | 'shuffling' | 'playing'>('colorSelection');
  const [gameControllerKey, setGameControllerKey] = useState<number>(0);

  // Keep selected colors in sync with data from the server
  useEffect(() => {
    const syncedColors = players.reduce((acc, player) => {
      if (player.color) {
        acc[player.id] = player.color;
      }
      return acc;
    }, {} as Record<string, string>);

    if (Object.keys(syncedColors).length === 0) {
      return;
    }

    setSelectedColors(prev => {
      let hasChanges = false;
      const updated = { ...prev };

      Object.entries(syncedColors).forEach(([id, color]) => {
        if (updated[id] !== color) {
          updated[id] = color;
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [players]);

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
      gameStateRef.current = updatedGameState;
      setCurrentTurnPlayer(updatedGameState.players[updatedGameState.currentPlayerIndex]?.name || '');
      setIsCurrentPlayerTurn(isMyTurn);
      
      // Force a complete re-render of the GameController by updating the key
      // This ensures the controller fully reinitializes with the new state
      setGameControllerKey(prev => prev + 1);
    };

    // Handle moves from other players
    const onPlayerMove = (data: any) => {
        console.log('📣 Received player move:', data);

        const currentState = gameStateRef.current;

        if (!data || !data.playerId || !currentState) {
            console.error('❌ Invalid move data received:', data);
            return;
        }

        // Is this move from another player?
        const isOtherPlayerMove = data.playerId !== playerId;
        console.log(`🎮 Move from ${isOtherPlayerMove ? 'another' : 'this'} player`);

        // Apply the move to our local game state
        try {
            // Clone the current game state to avoid direct mutations
            const updatedGameState = JSON.parse(JSON.stringify(currentState));

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
                gameStateRef.current = updatedGameState;

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
        gameStateRef.current = gameState;
        setGamePhase('playing');
        
        // Set the current player 
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
    gameStateRef.current = newGameState;
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

  // Prepare and send the initial online game state (host only)
  const sendInitialGameState = () => {
    if (!isOnlineMode || !roomId || !isHost || players.length === 0) {
      return;
    }

    const deck = generateShuffledDeck();

    const playerColorsBySection = players.reduce((colors, player, index) => {
      const color = selectedColors[player.id] || player.color || '#CCCCCC';
      colors[`player_${index + 1}`] = color;
      return colors;
    }, {} as Record<string, string>);

    const board = createBoard(
      `board-${Date.now()}`,
      players.length,
      playerColorsBySection
    );

    const playerStates = players.map((player, index) => {
      const color = selectedColors[player.id] || player.color || '#CCCCCC';
      const hand = deck.splice(0, 5);
      const pegIds = Array.from({ length: 5 }, (_, pegIndex) => `${player.id}-peg-${pegIndex + 1}`);

      const sectionStartId = `section${index + 1}_starting`;
      const startingSpace = board.allSpaces.get(sectionStartId);
      if (startingSpace) {
        startingSpace.pegs = [...pegIds];
      }

      return {
        id: player.id,
        name: player.name,
        color,
        hand,
        pegs: pegIds,
        isComplete: false,
        teamId: index
      };
    });

    const serializableBoard = {
      ...board,
      allSpaces: Object.fromEntries(board.allSpaces)
    } as unknown as GameState['board'];

    const initialGameState: GameState = {
      id: `game-${Date.now()}`,
      players: playerStates,
      currentPlayerIndex: 0,
      phase: 'playing',
      board: serializableBoard,
      drawPile: deck,
      discardPile: [],
      moves: [],
      winner: undefined
    };

    console.log('Initial game state created:', initialGameState);

    setGameState(initialGameState);
    setCurrentPlayerIndex(0);
    setCurrentTurnPlayer(playerStates[0]?.name || '');
    setIsCurrentPlayerTurn(playerStates[0]?.id === playerId);
    setGamePhase('playing');

    socket?.emit('shuffle-cards', {
      roomId,
      deckState: initialGameState
    });
  };

  // Function to proceed to the game after color selection
  const handleProceedToGame = () => {
    if (!isOnlineMode || !roomId || !isHost) return;

    setGamePhase('shuffling');

    socket?.emit('change-game-phase', { roomId, phase: 'shuffling' });

    // Give clients a brief moment to transition to the shuffling screen
    setTimeout(() => {
      sendInitialGameState();
    }, 750);
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
  

  // Debug info
  useEffect(() => {
    if (gameState && gamePhase === 'playing') {
      console.log("Game players:", gameState.players);
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const currentPlayer = gameState.players[currentPlayerIndex];

      console.log("Current game state:", {
        phase: gamePhase,
        currentPlayerIndex,
        currentPlayer: currentPlayer ? {
          id: currentPlayer.id,
          name: currentPlayer.name,
          isHost: (currentPlayer as any).isHost
        } : null,
        localPlayerId: playerId,
        isCurrentPlayerTurn: !!(currentPlayer && currentPlayer.id === playerId)
      });
    }
  }, [gameState, gamePhase, playerId]);

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
        isLocalPlayerTurn: gameState.players?.[gameState.currentPlayerIndex]?.id === playerId
      });
    }
  }, [gameState, playerId]);

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
      
      const isCurrentPlayerTurn: boolean = !!(currentPlayer && currentPlayer.id === playerId);

      console.log('🎮 Rendering game with current player turn:', {
        currentPlayerIndex,
        isCurrentPlayerTurn,
        myId: playerId
      });

      console.log("Turn information:", {
        currentPlayerIndex,
        currentPlayerId: currentPlayer?.id,
        localPlayerId: playerId,
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