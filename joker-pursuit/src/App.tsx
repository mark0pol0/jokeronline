import React, { useState } from 'react';
import './App.css';
import GameController from './components/Game/GameController';
import HomeMenu from './components/HomeMenu/HomeMenu';
import SetupScreen from './components/SetupScreen/SetupScreen';

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

type GamePhase = 'home' | 'setup' | 'playing';

const App: React.FC = () => {
  const [gamePhase, setGamePhase] = useState<GamePhase>('home');
  const [playerNames, setPlayerNames] = useState<string[]>(['Player 1', 'Player 2']);
  const [playerTeams, setPlayerTeams] = useState<Record<string, number>>({
    'player-1': 0,
    'player-2': 1
  });
  const [playerColors, setPlayerColors] = useState<Record<string, string>>({
    'player-1': PLAYER_COLORS[0].value,
    'player-2': PLAYER_COLORS[1].value
  });
  const [teamMode, setTeamMode] = useState<boolean>(false);

  const addPlayer = () => {
    if (playerNames.length < 8) {
      const newPlayerIndex = playerNames.length + 1;
      const playerId = `player-${newPlayerIndex}`;
      setPlayerNames([...playerNames, `Player ${newPlayerIndex}`]);
      setPlayerTeams({
        ...playerTeams,
        [playerId]: newPlayerIndex % 2 // Alternate teams
      });
      setPlayerColors({
        ...playerColors,
        [playerId]: PLAYER_COLORS[newPlayerIndex % PLAYER_COLORS.length].value
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

  return (
    <div className="App">
      {gamePhase === 'home' && (
        <HomeMenu onStartGame={() => setGamePhase('setup')} />
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
    </div>
  );
};

export default App;
