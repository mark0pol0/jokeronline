import React, { useEffect, useState } from 'react';
import { createFloatingDecorElements, FloatingDecorElement } from '../../utils/floatingDecor';
import './SetupScreen.css';

interface SetupScreenProps {
  playerNames: string[];
  playerTeams: Record<string, number>;
  playerColors: Record<string, string>;
  teamMode: boolean;
  onUpdatePlayerName: (index: number, name: string) => void;
  onUpdatePlayerTeam: (playerId: string, team: number) => void;
  onUpdatePlayerColor: (playerId: string, color: string) => void;
  onAddPlayer: () => void;
  onRemovePlayer: () => void;
  onToggleTeamMode: () => void;
  onStartGame: () => void;
  onBack: () => void;
}

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

const SetupScreen: React.FC<SetupScreenProps> = ({
  playerNames,
  playerTeams,
  playerColors,
  teamMode,
  onUpdatePlayerName,
  onUpdatePlayerTeam,
  onUpdatePlayerColor,
  onAddPlayer,
  onRemovePlayer,
  onToggleTeamMode,
  onStartGame,
  onBack
}) => {
  const [floatingElements, setFloatingElements] = useState<FloatingDecorElement[]>([]);

  // Check if teams can be used (when player count is even: 2, 4, 6, 8)
  const canUseTeams = playerNames.length % 2 === 0;

  useEffect(() => {
    setFloatingElements(createFloatingDecorElements());
  }, []);

  return (
    <div className="setup-screen">
      {/* Animated background elements */}
      {floatingElements.map(element => (
        <div
          key={element.id}
          className={`floating-element ${element.type}`}
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            backgroundColor: element.type === 'peg' ? element.color : undefined,
            '--float-rotation': `${element.rotation}deg`,
            '--float-scale': `${element.scale}`,
            '--float-drift-x': `${element.driftX}px`,
            '--float-drift-y': `${element.driftY}px`,
            '--float-duration': `${element.duration}s`,
            '--float-delay': `${element.delay}s`
          } as React.CSSProperties}
        />
      ))}

      <div className="setup-content">
        <h1 className="setup-title">Game Setup</h1>
        <div className="vintage-line"></div>
        
        <div className="setup-section">
          <label>Number of Players: {playerNames.length}</label>
          <div className="button-group">
            <button 
              className="control-button"
              onClick={onRemovePlayer} 
              disabled={playerNames.length <= 2}
              aria-label="Remove Player"
            >
              −
            </button>
            <button 
              className="control-button"
              onClick={onAddPlayer} 
              disabled={playerNames.length >= 8}
              aria-label="Add Player"
            >
              +
            </button>
          </div>
        </div>
        
        <div className="players-section">
          {playerNames.map((name, index) => {
            const playerId = `player-${index + 1}`;
            return (
              <div key={playerId} className="player-row">
                <div className="player-input">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => onUpdatePlayerName(index, e.target.value)}
                    placeholder={`Player ${index + 1}`}
                    maxLength={20}
                    aria-label={`Player ${index + 1} Name`}
                  />
                </div>
                
                <div className="player-options">
                  {teamMode && (
                    <div className="team-select">
                      <label>Team:</label>
                      {canUseTeams ? (
                        <select
                          value={playerTeams[playerId]}
                          onChange={(e) => onUpdatePlayerTeam(playerId, Number(e.target.value))}
                          aria-label={`${name}'s Team`}
                          style={{
                            backgroundColor: playerTeams[playerId] === 0 ? '#3F51B5' : '#F44336',
                            color: 'white'
                          }}
                        >
                          <option value={0}>Team 1</option>
                          <option value={1}>Team 2</option>
                        </select>
                      ) : (
                        <div className="unavailable-option">Unavailable</div>
                      )}
                    </div>
                  )}
                  
                  <div className="color-select">
                    <label>Color:</label>
                    <select
                      value={playerColors[playerId]}
                      onChange={(e) => onUpdatePlayerColor(playerId, e.target.value)}
                      style={{ backgroundColor: playerColors[playerId], color: 'white' }}
                      aria-label={`${name}'s Color`}
                    >
                      {PLAYER_COLORS.map((color) => (
                        <option 
                          key={color.value} 
                          value={color.value}
                          style={{ backgroundColor: color.value }}
                        >
                          {color.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="setup-actions">
          <button className="skeuomorphic-button secondary-button" data-testid="setup-back" onClick={onBack}>
            <span className="button-text">Back</span>
            <div className="button-shine"></div>
          </button>
          
          <div className="team-mode-toggle">
            <label className="toggle-label">Team Mode</label>
            <div className="toggle-switch" onClick={onToggleTeamMode}>
              <div className={`toggle-slider ${teamMode ? 'active' : ''}`}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
          
          <button 
            className="skeuomorphic-button primary-button" 
            onClick={onStartGame}
            disabled={playerNames.length < 2}
            data-testid="setup-start-game"
          >
            <span className="button-text">Start Game</span>
            <div className="button-shine"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupScreen; 
