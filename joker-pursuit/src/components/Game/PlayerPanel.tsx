import React from 'react';
import { Player } from '../../models/Player';
import { GameState } from '../../models/GameState';
import { BoardSpace } from '../../models/BoardModel';
import './PlayerPanel.css';

interface PlayerPanelProps {
  player: Player;
  isCurrentPlayer: boolean;
  isCurrentTeam: boolean;
  gameState: GameState;
}

const PlayerPanel: React.FC<PlayerPanelProps> = ({
  player,
  isCurrentPlayer,
  isCurrentTeam,
  gameState
}) => {
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

  // Count pegs in different locations
  const pegsInStarting = player.pegs.filter(pegId => getPegSpaceType(pegId) === 'starting').length;
  const pegsInCastle = player.pegs.filter(pegId => getPegSpaceType(pegId) === 'castle').length;
  const pegsOnBoard = player.pegs.length - pegsInStarting - pegsInCastle;
  
  // CSS classes
  const panelClasses = `
    player-panel 
    ${isCurrentPlayer ? 'current-player' : ''} 
    ${isCurrentTeam ? 'current-team' : ''}
    ${player.isComplete ? 'completed' : ''}
  `;
  
  return (
    <div className={panelClasses} style={{ borderColor: player.color }}>
      <div className="player-header" style={{ backgroundColor: player.color }}>
        <h3 className="player-name">{player.name}</h3>
        <div className="player-team">Team {player.teamId}</div>
      </div>
      
      <div className="player-stats">
        <div className="player-stat">
          <span className="stat-label">Cards:</span>
          <span className="stat-value">{player.hand.length}</span>
        </div>
        
        <div className="player-stat">
          <span className="stat-label">Starting:</span>
          <span className="stat-value">{pegsInStarting}</span>
        </div>
        
        <div className="player-stat">
          <span className="stat-label">On Board:</span>
          <span className="stat-value">{pegsOnBoard}</span>
        </div>
        
        <div className="player-stat">
          <span className="stat-label">In Castle:</span>
          <span className="stat-value">{pegsInCastle}</span>
        </div>
      </div>
      
      {player.isComplete && (
        <div className="player-completed">
          COMPLETED
        </div>
      )}
      
      {isCurrentPlayer && (
        <div className="player-turn-indicator">
          YOUR TURN
        </div>
      )}
    </div>
  );
};

export default PlayerPanel; 