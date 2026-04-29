export type SoundEffect =
  | 'ui'
  | 'card'
  | 'peg-pickup'
  | 'peg-place'
  | 'peg-move'
  | 'bump'
  | 'invalid'
  | 'shuffle'
  | 'reveal'
  | 'win';

interface SoundOptions {
  distance?: number;
  destinationType?: 'home' | 'castle' | 'board' | 'starting';
  intensity?: number;
}

type AudioContextConstructor = typeof AudioContext;

const getAudioContextConstructor = (): AudioContextConstructor | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
};

class SoundEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private musicTimer: number | null = null;
  private musicBeat = 0;
  private muted = false;
  private sfxVolume = 0.72;
  private musicVolume = 0.22;

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.02);
    }
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain && this.context) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.context.currentTime, 0.02);
    }
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGain && this.context) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.context.currentTime, 0.08);
    }
  }

  async unlock(): Promise<boolean> {
    const context = this.ensureContext();
    if (!context) {
      return false;
    }

    if (context.state === 'suspended') {
      await context.resume();
    }

    return context.state === 'running';
  }

  play(effect: SoundEffect, options: SoundOptions = {}) {
    if (this.muted) {
      return;
    }

    const context = this.ensureContext();
    if (!context || !this.sfxGain) {
      return;
    }

    if (context.state === 'suspended') {
      void context.resume();
    }

    const start = context.currentTime + 0.005;

    switch (effect) {
      case 'ui':
        this.playSoftClick(start, 520, 0.035, 0.2);
        break;
      case 'card':
        this.playCardTap(start);
        break;
      case 'peg-pickup':
        this.playWoodTap(start, 0.18, 0.74);
        break;
      case 'peg-place':
        this.playPegPlace(start, options);
        break;
      case 'peg-move':
        this.playPegMove(start, options);
        break;
      case 'bump':
        this.playBump(start);
        break;
      case 'invalid':
        this.playSoftClick(start, 160, 0.075, 0.15);
        break;
      case 'shuffle':
        this.playShuffle(start);
        break;
      case 'reveal':
        this.playReveal(start);
        break;
      case 'win':
        this.playWin(start);
        break;
      default:
        break;
    }
  }

  async startHomeMusic() {
    const context = this.ensureContext();
    if (!context || !this.musicGain || this.musicTimer !== null || this.muted) {
      return;
    }

    if (context.state === 'suspended') {
      return;
    }

    this.musicBeat = 0;
    this.musicGain.gain.setTargetAtTime(this.musicVolume, context.currentTime, 0.25);
    this.scheduleMusicBeat();
    this.musicTimer = window.setInterval(() => this.scheduleMusicBeat(), 560);
  }

  stopHomeMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    if (this.musicGain && this.context) {
      this.musicGain.gain.setTargetAtTime(0, this.context.currentTime, 0.18);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) {
      return null;
    }

    const context = new AudioContextClass();
    const masterGain = context.createGain();
    const sfxGain = context.createGain();
    const musicGain = context.createGain();
    const compressor = context.createDynamicsCompressor();

    masterGain.gain.value = this.muted ? 0 : 1;
    sfxGain.gain.value = this.sfxVolume;
    musicGain.gain.value = 0;
    compressor.threshold.value = -19;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;

    sfxGain.connect(compressor);
    musicGain.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(context.destination);

    this.context = context;
    this.masterGain = masterGain;
    this.sfxGain = sfxGain;
    this.musicGain = musicGain;
    this.compressor = compressor;
    return context;
  }

  private createTone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    destination: AudioNode | null = this.sfxGain
  ) {
    if (!this.context || !destination) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private createNoiseBurst(
    start: number,
    duration: number,
    volume: number,
    filterFrequency: number,
    destination: AudioNode | null = this.sfxGain
  ) {
    if (!this.context || !destination) {
      return;
    }

    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 1.6);
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = filterFrequency;
    filter.Q.value = 2.6;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private playSoftClick(start: number, frequency: number, duration: number, volume: number) {
    this.createTone(frequency, start, duration, volume, 'triangle');
    this.createTone(frequency * 1.52, start + 0.006, duration * 0.7, volume * 0.35, 'sine');
  }

  private playCardTap(start: number) {
    this.createNoiseBurst(start, 0.036, 0.13, 2300);
    this.createTone(740, start + 0.006, 0.046, 0.06, 'triangle');
  }

  private playWoodTap(start: number, volume: number, pitch: number) {
    this.createNoiseBurst(start, 0.03, volume * 0.45, 1250 + pitch * 380);
    this.createTone(220 + pitch * 80, start, 0.075, volume * 0.34, 'triangle');
    this.createTone(610 + pitch * 120, start + 0.004, 0.045, volume * 0.18, 'sine');
  }

  private playPegPlace(start: number, options: SoundOptions) {
    const destinationWeight = options.destinationType === 'castle'
      ? 1.16
      : options.destinationType === 'home'
        ? 0.82
        : 1;
    const intensity = Math.max(0.65, Math.min(1.3, options.intensity ?? 1));
    this.playWoodTap(start, 0.28 * intensity, destinationWeight);
    this.createTone(118 * destinationWeight, start + 0.018, 0.105, 0.09 * intensity, 'sine');
  }

  private playPegMove(start: number, options: SoundOptions) {
    const distance = Math.max(1, Math.min(8, options.distance ?? 3));
    const taps = Math.min(4, Math.max(2, Math.ceil(distance / 2)));

    for (let i = 0; i < taps; i += 1) {
      this.playWoodTap(start + i * 0.052, 0.13 + i * 0.018, 0.56 + i * 0.08);
    }

    this.playPegPlace(start + taps * 0.052, {
      ...options,
      intensity: 0.95 + taps * 0.04
    });
  }

  private playBump(start: number) {
    this.playPegPlace(start, { intensity: 1.2, destinationType: 'board' });
    this.createTone(145, start + 0.07, 0.12, 0.11, 'triangle');
    this.createNoiseBurst(start + 0.055, 0.07, 0.12, 760);
  }

  private playShuffle(start: number) {
    for (let i = 0; i < 9; i += 1) {
      this.createNoiseBurst(start + i * 0.035, 0.048, 0.08, 1800 + i * 90);
    }
  }

  private playReveal(start: number) {
    this.createNoiseBurst(start, 0.08, 0.08, 2200);
    this.createTone(660, start + 0.015, 0.11, 0.08, 'triangle');
    this.createTone(990, start + 0.05, 0.09, 0.04, 'sine');
  }

  private playWin(start: number) {
    [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
      this.createTone(note, start + index * 0.09, 0.24, 0.12, 'triangle');
    });
  }

  private scheduleMusicBeat() {
    if (!this.context || !this.musicGain || this.muted) {
      return;
    }

    const beat = this.musicBeat;
    const start = this.context.currentTime + 0.08;
    const chordProgression = [
      [261.63, 329.63, 392.0, 493.88],
      [293.66, 349.23, 440.0, 523.25],
      [246.94, 329.63, 392.0, 587.33],
      [196.0, 293.66, 349.23, 493.88]
    ];
    const chord = chordProgression[Math.floor(beat / 4) % chordProgression.length];

    if (beat % 4 === 0) {
      chord.forEach((note, index) => {
        this.createTone(note, start + index * 0.012, 1.45, 0.022, 'sine', this.musicGain);
      });
      this.createTone(chord[0] / 2, start, 1.2, 0.026, 'triangle', this.musicGain);
    }

    if (beat % 2 === 1) {
      const melody = [659.25, 587.33, 523.25, 587.33, 659.25, 783.99, 739.99, 659.25];
      this.createTone(melody[beat % melody.length], start + 0.04, 0.34, 0.028, 'triangle', this.musicGain);
    }

    if (beat % 2 === 0) {
      this.createNoiseBurst(start + 0.015, 0.05, 0.013, 5200, this.musicGain);
    }

    this.musicBeat = (this.musicBeat + 1) % 32;
  }
}

export const soundEngine = new SoundEngine();
