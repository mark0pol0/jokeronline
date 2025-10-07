import React, { useState } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import ConnectionStatus from './ConnectionStatus';
import './MultiplayerStyles.css';

interface CreateGameRoomProps {
  onBack: () => void;
}

const CreateGameRoom: React.FC<CreateGameRoomProps> = ({ onBack }) => {
  const [playerName, setPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { createRoom, roomCode, players, isHost, error, clearError, startGame } = useMultiplayer();

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    
    setIsCreating(true);
    try {
      await createRoom(playerName.trim());
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartGame = async () => {
    try {
      await startGame();
    } catch (err) {
      console.error('Failed to start game:', err);
    }
  };

  return (
    <div className="multiplayer-container">
      <ConnectionStatus />
      <h2>Create Game Room</h2>
      
      {!roomCode ? (
        <form onSubmit={handleCreateRoom} className="multiplayer-form">
          <div className="form-group">
            <label htmlFor="playerName">Your Name:</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              required
            />
          </div>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={clearError} className="clear-error-btn">✕</button>
            </div>
          )}
          
          <div className="button-group">
            <button 
              type="button" 
              onClick={onBack}
              className="skeuomorphic-button secondary-button"
            >
              <span className="button-text">Back</span>
              <div className="button-shine"></div>
            </button>
            
            <button 
              type="submit" 
              className="skeuomorphic-button primary-button"
              disabled={isCreating || !playerName.trim()}
            >
              <span className="button-text">
                {isCreating ? 'Creating...' : 'Create Room'}
              </span>
              <div className="button-shine"></div>
            </button>
          </div>
        </form>
      ) : (
        <div className="waiting-room">
          <div className="room-code-display">
            <h3>Room Code:</h3>
            <div className="code-box">{roomCode}</div>
            <p>Share this code with your friends to join your game</p>
          </div>
          
          <div className="player-list">
            <h3>Players ({players.length}/8):</h3>
            <ul>
              {players.map(player => (
                <li key={player.id}>
                  {player.name} {player.id === players[0].id ? '(Host)' : ''}
                </li>
              ))}
            </ul>
          </div>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={clearError} className="clear-error-btn">✕</button>
            </div>
          )}
          
          <div className="button-group">
            <button 
              onClick={onBack}
              className="skeuomorphic-button secondary-button"
            >
              <span className="button-text">Leave Room</span>
              <div className="button-shine"></div>
            </button>
            
            {isHost && (
              <button 
                onClick={handleStartGame}
                className="skeuomorphic-button primary-button"
                disabled={players.length < 2} // Require at least 2 players
              >
                <span className="button-text">Start Game</span>
                <div className="button-shine"></div>
              </button>
            )}
          </div>
          
          {isHost && players.length < 2 && (
            <p className="helper-text">Wait for at least one more player to join before starting.</p>
          )}
          
          {!isHost && (
            <p className="helper-text">Waiting for the host to start the game...</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CreateGameRoom; 