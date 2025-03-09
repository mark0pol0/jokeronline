import React, { useState, useEffect } from 'react';
import './App.css';
import GameController from './components/Game/GameController';
import HomeMenu from './components/HomeMenu/HomeMenu';
import SetupScreen from './components/SetupScreen/SetupScreen';
import OnlineMenu from './components/Multiplayer/OnlineMenu';
import MultiplayerGameController from './components/Multiplayer/MultiplayerGameController';
import { useMultiplayer } from './context/MultiplayerContext';

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

// Main App component
const App: React.FC = () => {
  // Get multiplayer state
  const { isGameStarted, isOnlineMode } = useMultiplayer();
  
  // State
  const [gamePhase, setGamePhase] = useState<GamePhase>('home');
  const [onlineMode, setOnlineMode] = useState(false);
  const [playerNames, setPlayerNames] = useState(['Player 1', 'Player 2']);
  const [playerIds] = useState(['player-1', 'player-2']);
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
    setOnlineMode(true);
    setGamePhase('online');
  };

  const handleReturnToHome = () => {
    setGamePhase('home');
    setOnlineMode(false);
  };

  return (
    <div className="App">
      {gamePhase === 'home' && (
        <HomeMenu 
          onStartGame={() => setGamePhase('setup')} 
          onStartOnlineGame={handleStartOnlineGame}
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
          onStartGame={() => setGamePhase('playing')}
          onBack={() => setGamePhase('home')}
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
        <OnlineMenu onBack={handleReturnToHome} />
      )}
      {gamePhase === 'online-playing' && (
        <MultiplayerGameController onBack={handleReturnToHome} />
      )}
    </div>
  );
};

export default App;
