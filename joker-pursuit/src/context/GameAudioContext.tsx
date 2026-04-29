import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SoundEffect, soundEngine } from '../services/SoundEngine';

const SOUND_ENABLED_STORAGE_KEY = 'joker-pursuit.sound-enabled';
const MUSIC_ENABLED_STORAGE_KEY = 'joker-pursuit.music-enabled';

interface GameAudioContextValue {
  soundEnabled: boolean;
  musicEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  toggleMusic: () => void;
  unlock: () => Promise<boolean>;
  play: (effect: SoundEffect, options?: Parameters<typeof soundEngine.play>[1]) => void;
  startHomeMusic: () => void;
  stopHomeMusic: () => void;
}

const GameAudioContext = createContext<GameAudioContextValue | undefined>(undefined);

const readStoredBoolean = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch (error) {
    console.error(`Failed to read ${key}`, error);
    return fallback;
  }
};

const writeStoredBoolean = (key: string, value: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch (error) {
    console.error(`Failed to persist ${key}`, error);
  }
};

export const GameAudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [soundEnabled, setSoundEnabledState] = useState(() =>
    readStoredBoolean(SOUND_ENABLED_STORAGE_KEY, true)
  );
  const [musicEnabled, setMusicEnabledState] = useState(() =>
    readStoredBoolean(MUSIC_ENABLED_STORAGE_KEY, true)
  );

  useEffect(() => {
    soundEngine.setMuted(!soundEnabled);
    writeStoredBoolean(SOUND_ENABLED_STORAGE_KEY, soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    writeStoredBoolean(MUSIC_ENABLED_STORAGE_KEY, musicEnabled);
    if (!musicEnabled) {
      soundEngine.stopHomeMusic();
    }
  }, [musicEnabled]);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
  }, []);

  const setMusicEnabled = useCallback((enabled: boolean) => {
    setMusicEnabledState(enabled);
  }, []);

  const unlock = useCallback(async () => {
    if (!soundEnabled) {
      return false;
    }

    return soundEngine.unlock();
  }, [soundEnabled]);

  const play = useCallback<GameAudioContextValue['play']>((effect, options) => {
    if (!soundEnabled) {
      return;
    }

    soundEngine.play(effect, options);
  }, [soundEnabled]);

  const startHomeMusic = useCallback(() => {
    if (!soundEnabled || !musicEnabled) {
      return;
    }

    void soundEngine.startHomeMusic();
  }, [musicEnabled, soundEnabled]);

  const stopHomeMusic = useCallback(() => {
    soundEngine.stopHomeMusic();
  }, []);

  const value = useMemo<GameAudioContextValue>(() => ({
    soundEnabled,
    musicEnabled,
    setSoundEnabled,
    setMusicEnabled,
    toggleSound: () => setSoundEnabledState(current => !current),
    toggleMusic: () => setMusicEnabledState(current => !current),
    unlock,
    play,
    startHomeMusic,
    stopHomeMusic
  }), [
    musicEnabled,
    play,
    setMusicEnabled,
    setSoundEnabled,
    soundEnabled,
    startHomeMusic,
    stopHomeMusic,
    unlock
  ]);

  return (
    <GameAudioContext.Provider value={value}>
      {children}
    </GameAudioContext.Provider>
  );
};

const noopContext: GameAudioContextValue = {
  soundEnabled: true,
  musicEnabled: true,
  setSoundEnabled: () => undefined,
  setMusicEnabled: () => undefined,
  toggleSound: () => undefined,
  toggleMusic: () => undefined,
  unlock: async () => false,
  play: () => undefined,
  startHomeMusic: () => undefined,
  stopHomeMusic: () => undefined
};

export const useGameAudio = (): GameAudioContextValue => (
  useContext(GameAudioContext) || noopContext
);
