import React from 'react';
import { useGameAudio } from '../../context/GameAudioContext';
import './AudioControls.css';

const AudioControls: React.FC = () => {
  const {
    soundEnabled,
    musicEnabled,
    toggleSound,
    toggleMusic,
    unlock,
    play,
    startHomeMusic
  } = useGameAudio();

  const handleSoundToggle = async () => {
    const nextEnabled = !soundEnabled;
    toggleSound();
    if (nextEnabled) {
      await unlock();
      play('ui');
      if (musicEnabled) {
        startHomeMusic();
      }
    }
  };

  const handleMusicToggle = async () => {
    const nextEnabled = !musicEnabled;
    toggleMusic();
    if (nextEnabled) {
      await unlock();
      play('ui');
      startHomeMusic();
    }
  };

  return (
    <div className="audio-controls" aria-label="Audio controls">
      <button
        type="button"
        className={`audio-control-button ${soundEnabled ? 'active' : ''}`}
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Turn sound off' : 'Turn sound on'}
        title={soundEnabled ? 'Sound on' : 'Sound off'}
        onClick={handleSoundToggle}
      >
        {soundEnabled ? '♪' : '×'}
      </button>
      <button
        type="button"
        className={`audio-control-button ${musicEnabled ? 'active' : ''}`}
        aria-pressed={musicEnabled}
        aria-label={musicEnabled ? 'Turn music off' : 'Turn music on'}
        title={musicEnabled ? 'Music on' : 'Music off'}
        onClick={handleMusicToggle}
      >
        ♫
      </button>
    </div>
  );
};

export default AudioControls;
