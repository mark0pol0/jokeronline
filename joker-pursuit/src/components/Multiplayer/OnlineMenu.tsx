import React, { useState } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import CreateGameRoom from './CreateGameRoom';
import JoinGameRoom from './JoinGameRoom';
import ConnectionSettings from './ConnectionSettings';
import './MultiplayerStyles.css';

interface OnlineMenuProps {
  onBack: () => void;
}

enum OnlineMenuState {
  MAIN = 'main',
  CREATE = 'create',
  JOIN = 'join'
}

const OnlineMenu: React.FC<OnlineMenuProps> = ({ onBack }) => {
  const [menuState, setMenuState] = useState<OnlineMenuState>(OnlineMenuState.MAIN);
  const { leaveRoom } = useMultiplayer();

  const handleBack = () => {
    // If in a submenu, go back to main online menu
    if (menuState !== OnlineMenuState.MAIN) {
      setMenuState(OnlineMenuState.MAIN);
      leaveRoom(); // Make sure to leave any room we might have joined/created
    } else {
      // If in main online menu, go back to home menu
      onBack();
    }
  };

  return (
    <div className="multiplayer-page">
      <div className="multiplayer-container">
        <ConnectionSettings />

        {menuState === OnlineMenuState.MAIN && (
          <section className="multiplayer-panel">
            <h2>Play Online</h2>
            <div className="online-menu">
              <div className="button-group">
                <button
                  onClick={() => setMenuState(OnlineMenuState.CREATE)}
                  className="skeuomorphic-button primary-button"
                >
                  <span className="button-text">Host a Game</span>
                  <div className="button-shine"></div>
                </button>

                <button
                  onClick={() => setMenuState(OnlineMenuState.JOIN)}
                  className="skeuomorphic-button primary-button"
                >
                  <span className="button-text">Join a Game</span>
                  <div className="button-shine"></div>
                </button>

                <button
                  onClick={onBack}
                  className="skeuomorphic-button secondary-button"
                >
                  <span className="button-text">Back to Menu</span>
                  <div className="button-shine"></div>
                </button>
              </div>
            </div>
          </section>
        )}

        {menuState === OnlineMenuState.CREATE && (
          <CreateGameRoom onBack={handleBack} />
        )}

        {menuState === OnlineMenuState.JOIN && (
          <JoinGameRoom onBack={handleBack} />
        )}
      </div>
    </div>
  );
};

export default OnlineMenu; 