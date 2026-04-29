import React, { useState, useEffect } from 'react';
import './App.css';
import GameController from './components/Game/GameController';
import HomeMenu from './components/HomeMenu/HomeMenu';
import SetupScreen from './components/SetupScreen/SetupScreen';
import OnlineMenu from './components/Multiplayer/OnlineMenu';
import MultiplayerGameController from './components/Multiplayer/MultiplayerGameController';
import PWAInstallPrompt from './components/PWA/PWAInstallPrompt';
import AudioControls from './components/Audio/AudioControls';
import { useMultiplayer } from './context/MultiplayerContext';
import { useGameAudio } from './context/GameAudioContext';

// Available colors for player selection
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

type GamePhase = 'home' | 'setup' | 'playing' | 'online' | 'online-playing';
const EASY_MODE_STORAGE_KEY = 'joker-pursuit.easy-mode';

const getInitialLinkRoomCode = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const code = new URLSearchParams(window.location.search).get('room');
  if (!code) {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  return normalized || null;
};

const getInitialEasyMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(EASY_MODE_STORAGE_KEY) === 'true';
  } catch (error) {
    console.error('Failed to read easy mode preference', error);
    return false;
  }
};

// Main App component
const App: React.FC = () => {
  // Get multiplayer state
  const { isGameStarted, isOnlineMode } = useMultiplayer();
  const { startHomeMusic, stopHomeMusic, unlock, play } = useGameAudio();
  const [linkRoomCode] = useState<string | null>(() => getInitialLinkRoomCode());
  const [easyMode, setEasyMode] = useState<boolean>(() => getInitialEasyMode());
  
  // State
  const [gamePhase, setGamePhase] = useState<GamePhase>('home');
  const [playerNames, setPlayerNames] = useState(['Player 1', 'Player 2']);
  const [playerColors, setPlayerColors] = useState<Record<string, string>>({
    'player-1': PLAYER_COLORS[0].value, // Red for first player
    'player-2': PLAYER_COLORS[1].value  // Blue for second player
  });
  const [teamMode, setTeamMode] = useState(false);
  const [playerTeams, setPlayerTeams] = useState<Record<string, number>>({
    'player-1': 1,
    'player-2': 2
  });

  // Effect to transition to multiplayer game when the game is started
  useEffect(() => {
    if (isOnlineMode && isGameStarted && gamePhase !== 'online-playing') {
      console.log('Game started in multiplayer mode, transitioning to game screen');
      setGamePhase('online-playing');
    }
  }, [isOnlineMode, isGameStarted, gamePhase]);

  useEffect(() => {
    if (linkRoomCode && gamePhase === 'home') {
      setGamePhase('online');
    }
  }, [linkRoomCode, gamePhase]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(EASY_MODE_STORAGE_KEY, easyMode ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to persist easy mode preference', error);
    }
  }, [easyMode]);

  useEffect(() => {
    if (gamePhase === 'home') {
      startHomeMusic();
    } else {
      stopHomeMusic();
    }

    return () => {
      stopHomeMusic();
    };
  }, [gamePhase, startHomeMusic, stopHomeMusic]);

  useEffect(() => {
    if (gamePhase !== 'home' || typeof window === 'undefined') {
      return;
    }

    const handleFirstGesture = async () => {
      await unlock();
      startHomeMusic();
    };

    window.addEventListener('pointerdown', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [gamePhase, startHomeMusic, unlock]);

  const addPlayer = () => {
    if (playerNames.length < 8) {
      const newPlayerIndex = playerNames.length + 1;
      const playerId = `player-${newPlayerIndex}`;
      setPlayerNames([...playerNames, `Player ${newPlayerIndex}`]);
      setPlayerTeams({
        ...playerTeams,
        [playerId]: newPlayerIndex % 2 // Alternate teams
      });
      
      // Assign colors in sequence: Red, Blue, Green, Purple, Yellow, Pink, Cyan, Orange
      setPlayerColors({
        ...playerColors,
        [playerId]: PLAYER_COLORS[newPlayerIndex - 1].value
      });
    }
  };

  const removePlayer = () => {
    if (playerNames.length > 2) {
      const newPlayerNames = [...playerNames];
      newPlayerNames.pop();
      setPlayerNames(newPlayerNames);
      
      const lastPlayerId = `player-${playerNames.length}`;
      const newPlayerTeams = { ...playerTeams };
      const newPlayerColors = { ...playerColors };
      delete newPlayerTeams[lastPlayerId];
      delete newPlayerColors[lastPlayerId];
      
      setPlayerTeams(newPlayerTeams);
      setPlayerColors(newPlayerColors);
    }
  };

  const updatePlayerName = (index: number, name: string) => {
    const newPlayerNames = [...playerNames];
    newPlayerNames[index] = name;
    setPlayerNames(newPlayerNames);
  };

  const updatePlayerTeam = (playerId: string, team: number) => {
    setPlayerTeams({
      ...playerTeams,
      [playerId]: team
    });
  };

  const updatePlayerColor = (playerId: string, color: string) => {
    setPlayerColors({
      ...playerColors,
      [playerId]: color
    });
  };

  const toggleTeamMode = () => {
    setTeamMode(!teamMode);
  };

  const handleStartOnlineGame = () => {
    play('ui');
    setGamePhase('online');
  };

  const handleReturnToHome = () => {
    play('ui');
    setGamePhase('home');
  };

  return (
    <div className="App">
      <AudioControls />
      {gamePhase !== 'playing' && gamePhase !== 'online-playing' && <PWAInstallPrompt />}
      {gamePhase === 'home' && (
        <HomeMenu 
          onStartGame={() => {
            play('ui');
            setGamePhase('setup');
          }}
          onStartOnlineGame={handleStartOnlineGame}
          easyMode={easyMode}
          onToggleEasyMode={() => {
            play('ui');
            setEasyMode(current => !current);
          }}
        />
      )}
      {gamePhase === 'setup' && (
        <SetupScreen
          playerNames={playerNames}
          playerTeams={playerTeams}
          playerColors={playerColors}
          teamMode={teamMode}
          onUpdatePlayerName={updatePlayerName}
          onUpdatePlayerTeam={updatePlayerTeam}
          onUpdatePlayerColor={updatePlayerColor}
          onAddPlayer={addPlayer}
          onRemovePlayer={removePlayer}
          onToggleTeamMode={toggleTeamMode}
          onStartGame={() => {
            play('reveal');
            setGamePhase('playing');
          }}
          onBack={() => {
            play('ui');
            setGamePhase('home');
          }}
        />
      )}
      {gamePhase === 'playing' && (
        <GameController 
          playerNames={playerNames}
          playerTeams={playerTeams}
          playerColors={playerColors}
          numBoardSections={playerNames.length}
        />
      )}
      {gamePhase === 'online' && (
        <OnlineMenu
          onBack={handleReturnToHome}
          initialJoinRoomCode={linkRoomCode}
          easyMode={easyMode}
        />
      )}
      {gamePhase === 'online-playing' && (
        <MultiplayerGameController onBack={handleReturnToHome} />
      )}
    </div>
  );
};

export default App;
