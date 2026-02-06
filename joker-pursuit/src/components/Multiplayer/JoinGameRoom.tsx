import React, { useState } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import ConnectionStatus from './ConnectionStatus';
import './MultiplayerStyles.css';

interface JoinGameRoomProps {
  onBack: () => void;
}

const JoinGameRoom: React.FC<JoinGameRoomProps> = ({ onBack }) => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { 
    joinRoom, 
    roomCode: connectedRoomCode, 
    players, 
    error, 
    clearError 
  } = useMultiplayer();

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) return;
    
    setIsJoining(true);
    try {
      await joinRoom(roomCode.trim(), playerName.trim());
    } catch (err) {
      console.error('Failed to join room:', err);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="multiplayer-shell">
      <div className="multiplayer-container join-room">
        <ConnectionStatus />
        <h2>Join Game Room</h2>
        <p className="multiplayer-lead">Enter your name and room code to join an active match.</p>

        {!connectedRoomCode ? (
          <form onSubmit={handleJoinRoom} className="multiplayer-form">
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

            <div className="form-group">
              <label htmlFor="roomCode">Room Code:</label>
              <input
                type="text"
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={6}
                required
              />
            </div>

            {error && (
              <div className="error-message">
                <p>{error}</p>
                <button type="button" onClick={clearError} className="clear-error-btn">✕</button>
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
                disabled={isJoining || !playerName.trim() || !roomCode.trim()}
              >
                <span className="button-text">
                  {isJoining ? 'Joining...' : 'Join Room'}
                </span>
                <div className="button-shine"></div>
              </button>
            </div>
          </form>
        ) : (
          <div className="waiting-room">
            <div className="room-code-display">
              <h3>Room Code</h3>
              <div className="code-box">{connectedRoomCode}</div>
            </div>

            <div className="waiting-player-list">
              <h3>Players ({players.length}/8)</h3>
              <ul>
                {players.map(player => (
                  <li key={player.id}>
                    <span>{player.name}</span>
                    {player.id === players[0].id && <span className="host-badge">Host</span>}
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="error-message">
                <p>{error}</p>
                <button type="button" onClick={clearError} className="clear-error-btn">✕</button>
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
            </div>

            <p className="helper-text">Waiting for the host to start the game...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinGameRoom; 
