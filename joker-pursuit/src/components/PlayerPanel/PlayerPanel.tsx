import React from 'react';
import { Player } from '../../models/Player';
import { GameState } from '../../models/GameState';
import { BoardSpace } from '../../models/BoardModel';
import './PlayerPanel.css';

interface PlayerPanelProps {
  player: Player;
  isCurrentPlayer: boolean;
  color: string;
  gameState: GameState;
}

const PlayerPanel: React.FC<PlayerPanelProps> = ({ player, isCurrentPlayer, color, gameState }) => {
  // Helper function to safely get all spaces as an array
  const getSpacesArray = (spaceCollection: any): BoardSpace[] => {
    if (!spaceCollection) return [];
    
    if (spaceCollection instanceof Map) {
      // Client-side Map object
      return Array.from(spaceCollection.values());
    } else {
      // Server-side serialized object
      return Object.values(spaceCollection);
    }
  };
  
  // Helper function to find what type of space a peg is in
  const getPegSpaceType = (pegId: string): string => {
    // Find the space containing this peg
    for (const space of getSpacesArray(gameState.board.allSpaces)) {
      if (space.pegs.includes(pegId)) {
        return space.type;
      }
    }
    return 'unknown';
  };

  // Calculate completion percentage
  const completedPegs = player.pegs.filter(pegId => getPegSpaceType(pegId) === 'castle').length;
  const completionPercentage = (completedPegs / player.pegs.length) * 100;
  
  return (
    <div className={`player-panel ${isCurrentPlayer ? 'current-player' : ''}`}>
      <div className="player-header" style={{ backgroundColor: color }}>
        <div className="player-name">{player.name}</div>
        <div className="player-team">Team {player.teamId + 1}</div>
      </div>
      
      <div className="player-progress">
        <div 
          className="progress-bar" 
          style={{ 
            width: `${completionPercentage}%`,
            backgroundColor: color
          }}
        ></div>
      </div>
      
      <div className="player-cards">
        <span className="cards-label">Cards:</span>
        <span className="cards-value">{player.hand.length}</span>
      </div>
      
      <div className="player-pegs">
        {player.pegs.map((pegId, index) => {
          const pegType = getPegSpaceType(pegId);
          return (
            <div 
              key={index} 
              className={`peg-indicator ${pegType === 'castle' ? 'peg-home' : ''}`}
              style={{ 
                backgroundColor: pegType === 'castle' ? color : '#ccc',
                border: `2px solid ${color}`
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default PlayerPanel; 