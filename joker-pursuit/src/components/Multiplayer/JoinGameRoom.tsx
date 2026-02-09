import React, { useState } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import ConnectionStatus from './ConnectionStatus';
import './MultiplayerStyles.css';

interface JoinGameRoomProps {
  onBack: () => void;
  initialRoomCode?: string | null;
}

const JoinGameRoom: React.FC<JoinGameRoomProps> = ({ onBack, initialRoomCode }) => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode?.toUpperCase() || '');
  const [isJoining, setIsJoining] = useState(false);
  const { 
    joinRoom, 
    roomCode: connectedRoomCode, 
    playerId,
    hostPlayerId,
    sessionToken,
    players, 
    playersPresence,
    isRejoining,
    error, 
    clearError 
  } = useMultiplayer();

  const hasJoinedRoom = Boolean(
    connectedRoomCode &&
    sessionToken &&
    playerId &&
    players.some(player => player.id === playerId)
  );

  React.useEffect(() => {
    if (hasJoinedRoom) {
      return;
    }

    const nextRoomCode = connectedRoomCode || initialRoomCode;
    if (nextRoomCode) {
      setRoomCode(nextRoomCode.toUpperCase());
    }
  }, [hasJoinedRoom, connectedRoomCode, initialRoomCode]);

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

  const resolvedHostPlayerId = hostPlayerId || players[0]?.id || null;

  const getPresenceLabel = (targetPlayerId: string): string => {
    const presence = playersPresence[targetPlayerId];
    if (!presence) {
      return 'Unknown';
    }
    if (presence.status === 'connected') {
      return 'Connected';
    }
    if (presence.status === 'reconnecting') {
      return 'Reconnecting';
    }
    return 'Disconnected';
  };

  const getPresenceTone = (targetPlayerId: string): string => {
    const presence = playersPresence[targetPlayerId];
    if (!presence) {
      return 'unknown';
    }
    if (presence.status === 'connected') {
      return 'connected';
    }
    if (presence.status === 'reconnecting') {
      return 'reconnecting';
    }
    return 'disconnected';
  };

  return (
    <div className="multiplayer-shell">
      <div className="multiplayer-container join-room">
        <ConnectionStatus />
        <h2>Join Game Room</h2>
        <p className="multiplayer-lead">Enter your name and room code to join an active match.</p>

        {!hasJoinedRoom ? (
          <form onSubmit={handleJoinRoom} className="multiplayer-form">
            {isRejoining && (
              <p className="helper-text">Attempting to reclaim your previous seat...</p>
            )}
            <div className="form-group">
              <label htmlFor="playerName">Your Name:</label>
              <input
                type="text"
                id="playerName"
                data-testid="join-room-player-name"
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
                data-testid="join-room-code-input"
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
                data-testid="join-room-back"
              >
                <span className="button-text">Back</span>
                <div className="button-shine"></div>
              </button>

              <button
                type="submit"
                className="skeuomorphic-button primary-button"
                disabled={isJoining || !playerName.trim() || !roomCode.trim()}
                data-testid="join-room-submit"
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
              <div className="code-box" data-testid="join-room-code">{connectedRoomCode}</div>
            </div>

            <div className="waiting-player-list">
              <h3>Players ({players.length}/8)</h3>
              <ul>
                {players.map(player => {
                  const isSelf = player.id === playerId;
                  const isHostPlayer = player.id === resolvedHostPlayerId;
                  const presenceTone = getPresenceTone(player.id);
                  const presenceLabel = getPresenceLabel(player.id);

                  return (
                    <li key={player.id}>
                      <span className="waiting-player-name">{player.name}</span>
                      <span className="waiting-player-badges">
                        {isSelf && <span className="player-badge role-you">You</span>}
                        {isHostPlayer && <span className="player-badge role-host">Host</span>}
                        <span className={`player-badge presence-${presenceTone}`}>{presenceLabel}</span>
                      </span>
                    </li>
                  );
                })}
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
                data-testid="join-room-leave"
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
