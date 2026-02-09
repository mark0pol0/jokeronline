import React, { useEffect, useState } from 'react';
import { createFloatingDecorElements, FloatingDecorElement } from '../../utils/floatingDecor';
import './HomeMenu.css';

interface HomeMenuProps {
  onStartGame: () => void;
  onStartOnlineGame: () => void;
}

const HomeMenu: React.FC<HomeMenuProps> = ({ onStartGame, onStartOnlineGame }) => {
  const [floatingElements, setFloatingElements] = useState<FloatingDecorElement[]>([]);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  useEffect(() => {
    setFloatingElements(createFloatingDecorElements());
  }, []);

  return (
    <div className="home-menu">
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

      {/* Main content */}
      <div className="menu-content">
        <h1 className="game-title">Joker Pursuit</h1>
        <div className="vintage-line"></div>
        <p className="game-subtitle">A Classic Card-Based Board Game</p>
        
        <div className="button-container">
          <button className="skeuomorphic-button primary-button" data-testid="home-local-game" onClick={onStartGame}>
            <span className="button-text">Local Game</span>
            <div className="button-shine"></div>
          </button>
          
          <button className="skeuomorphic-button primary-button" data-testid="home-play-online" onClick={onStartOnlineGame}>
            <span className="button-text">Play Online</span>
            <div className="button-shine"></div>
          </button>
          
          <button 
            className="skeuomorphic-button secondary-button" 
            onClick={() => setShowHowToPlay(true)}
          >
            <span className="button-text">How to Play</span>
            <div className="button-shine"></div>
          </button>
        </div>
      </div>

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className="modal-overlay" onClick={() => setShowHowToPlay(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>How to Play</h2>
            <div className="modal-body">
              <h3>Game Overview</h3>
              <p>Joker Pursuit is a strategic board game for 1 to 8+ players where each player has 5 pegs and uses cards to move them from the starting circle into their castle.</p>
              
              <h3>Setup</h3>
              <ul>
                <li>Each player gets 5 pegs and a deck of 54 cards</li>
                <li>Players are dealt 5 cards each</li>
                <li>Players take turns in circular fashion, clockwise around the board to the left</li>
              </ul>

              <h3>Card Actions</h3>
              <ul>
                <li><strong>Ace:</strong> Moves a peg one space, OR out of the starting circle, OR moves from one corner of the board to the next even if this skips over one's own pegs</li>
                <li><strong>Face Cards (J, Q, K):</strong> Moves a peg forward ten spaces, OR out of the starting circle</li>
                <li><strong>Joker:</strong> Moves a peg from the board or starting circle to bump another's peg on the board anywhere. Can skip one's own pegs, but can't attack others' circles or castles, and can't move to an empty space</li>
                <li><strong>Seven:</strong> Moves one peg forward seven spaces, OR may be split between two pegs with both moving forward</li>
                <li><strong>Eight:</strong> Moves eight spaces in reverse. If played right after getting out, the peg will end up on the back right corner</li>
                <li><strong>Nine:</strong> Moves one peg forward nine spaces, OR may be split between two pegs with one moving forward and the other in reverse</li>
                <li>All other cards (2-6, 10) move a peg forward their numeric value</li>
              </ul>

              <h3>Special Rules</h3>
              <ul>
                <li><strong>Teams:</strong> Players may play with two or more teams. Teammates sit opposite each other or alternate around the board. When a teammate completes their castle with a Seven or Nine split, the second part is immediately applied to the teammate to their left. If multiple players are done, they all play for the remaining teammate.</li>
                <li><strong>Bump:</strong> Landing on an opponent's peg bumps them back to the starting circle. Landing on a teammate's peg sends them to their castle entrance. If a peg is already at the entrance of their castle, it is accordingly bumped as well. A player's peg cannot bump their own peg, neither directly with a move nor later in a resulting chain reaction.</li>
                <li><strong>Jumping:</strong> Players may move their own pegs past the pegs of their opponents, but may not pass their own pegs. Jokers, Aces corner-to-corner, and Bumps are exceptions as these moves warp pegs from one place to another.</li>
                <li><strong>Discard:</strong> If a player has no playable moves, they must discard all five cards and draw a new hand as their turn. If a non-optimal but still possible move is available, they must play it instead of discarding, even if it is not advantageous.</li>
                <li><strong>Castle:</strong> Only a player's own pegs may enter their own castle. Pegs in castles are safe from attacks of other players. After a peg moves forward into the castle, it does not exit. Once all five pegs are in, the castle is complete.</li>
              </ul>

              <h3>Additional Rules</h3>
              <ul>
                <li><strong>Draw Pile:</strong> Players should all draw from one pile to prevent superstition that could arise from using multiple draw piles. Everyone should also discard in one pile to help remember whose turn is next.</li>
                <li><strong>Table Talk:</strong> Players, especially teammates, are not allowed to share information about cards they hold, cards they don't hold, moves they plan to make, or moves they wish others to make.</li>
                <li><strong>End of Game:</strong> The game ends immediately upon a team's completion of all their castles, with all five pegs of each player inside their castle without any gaps or other pegs left out on the board.</li>
              </ul>
            </div>
            <button 
              className="modal-close-button"
              onClick={() => setShowHowToPlay(false)}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeMenu; 
