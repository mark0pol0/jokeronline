import React, { useState } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import CreateGameRoom from './CreateGameRoom';
import JoinGameRoom from './JoinGameRoom';
import './MultiplayerStyles.css';

interface OnlineMenuProps {
  onBack: () => void;
  initialJoinRoomCode?: string | null;
}

enum OnlineMenuState {
  MAIN = 'main',
  CREATE = 'create',
  JOIN = 'join'
}

const OnlineMenu: React.FC<OnlineMenuProps> = ({ onBack, initialJoinRoomCode }) => {
  const [menuState, setMenuState] = useState<OnlineMenuState>(
    initialJoinRoomCode ? OnlineMenuState.JOIN : OnlineMenuState.MAIN
  );
  const { leaveRoom } = useMultiplayer();

  React.useEffect(() => {
    if (initialJoinRoomCode) {
      setMenuState(OnlineMenuState.JOIN);
    }
  }, [initialJoinRoomCode]);

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
    <div className="multiplayer-shell">
      {menuState === OnlineMenuState.MAIN && (
        <div className="multiplayer-container online-main">
          <h2>Play Online</h2>
          <p className="multiplayer-lead">
            Host a room for friends, or join with a room code.
          </p>
          <div className="online-menu">
            <div className="button-group">
              <button
                onClick={() => setMenuState(OnlineMenuState.CREATE)}
                className="skeuomorphic-button primary-button"
                data-testid="online-host-game"
              >
                <span className="button-text">Host a Game</span>
                <div className="button-shine"></div>
              </button>

              <button
                onClick={() => setMenuState(OnlineMenuState.JOIN)}
                className="skeuomorphic-button primary-button"
                data-testid="online-join-game"
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
        </div>
      )}

      {menuState === OnlineMenuState.CREATE && (
        <CreateGameRoom onBack={handleBack} />
      )}

      {menuState === OnlineMenuState.JOIN && (
        <JoinGameRoom onBack={handleBack} initialRoomCode={initialJoinRoomCode} />
      )}
    </div>
  );
};

export default OnlineMenu; 
