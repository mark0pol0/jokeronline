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
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const {
    createRoom,
    roomCode,
    players,
    playerId,
    hostPlayerId,
    playersPresence,
    isHost,
    error,
    clearError,
    startGame
  } = useMultiplayer();

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

  const inviteLink = roomCode
    ? `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`
    : '';
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

  const handleCopyInviteLink = async () => {
    if (!inviteLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopyStatus('copied');
    } catch (copyError) {
      console.error('Failed to copy invite link', copyError);
      setCopyStatus('failed');
    }
  };

  return (
    <div className="multiplayer-shell">
      <div className="multiplayer-container create-room">
        <ConnectionStatus />
        <h2>Create Game Room</h2>
        <p className="multiplayer-lead">Create a room and share the code with other players.</p>

        {!roomCode ? (
          <form onSubmit={handleCreateRoom} className="multiplayer-form">
            <div className="form-group">
              <label htmlFor="playerName">Your Name:</label>
              <input
                type="text"
                id="playerName"
                data-testid="create-room-player-name"
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
                <button type="button" onClick={clearError} className="clear-error-btn">✕</button>
              </div>
            )}

            <div className="button-group">
              <button
                type="button"
                onClick={onBack}
                className="skeuomorphic-button secondary-button"
                data-testid="create-room-back"
              >
                <span className="button-text">Back</span>
                <div className="button-shine"></div>
              </button>

              <button
                type="submit"
                className="skeuomorphic-button primary-button"
                disabled={isCreating || !playerName.trim()}
                data-testid="create-room-submit"
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
              <h3>Room Code</h3>
              <div className="code-box" data-testid="create-room-code">{roomCode}</div>
              <p>Share this code with your friends to join your game.</p>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="skeuomorphic-button secondary-button"
                data-testid="create-room-copy-link"
              >
                <span className="button-text">Copy Invite Link</span>
                <div className="button-shine"></div>
              </button>
              {copyStatus === 'copied' && (
                <p className="helper-text">Invite link copied to clipboard.</p>
              )}
              {copyStatus === 'failed' && (
                <p className="helper-text">Could not copy automatically. Please copy the URL manually.</p>
              )}
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
                data-testid="create-room-leave"
              >
                <span className="button-text">Leave Room</span>
                <div className="button-shine"></div>
              </button>

              {isHost && (
                <button
                  onClick={handleStartGame}
                  className="skeuomorphic-button primary-button"
                  disabled={players.length < 2}
                  data-testid="create-room-start-game"
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
    </div>
  );
};

export default CreateGameRoom; 
