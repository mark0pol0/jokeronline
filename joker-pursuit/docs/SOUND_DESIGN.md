# Joker Pursuit Sound Design

## Direction

The sound palette is tactile, small, and close-mic'd:

- Home screen: light lounge/elevator-music chords, brushed texture, soft melody.
- Cards: papery taps with a short high-frequency flick.
- Peg pickup: quiet wood tick.
- Peg movement: two to four small wooden taps followed by a rounded peg-seat thunk.
- Bumps: a firmer wood knock plus a low resonance.
- Errors: short muted tick, never harsh.

## Implementation

Audio is generated at runtime with the Web Audio API in `src/services/SoundEngine.ts`.
This keeps the first shipping version lightweight, offline-safe, and clear of third-party asset redistribution risk.

The runtime system is exposed through `GameAudioProvider` and `useGameAudio`.
Preferences are stored in local storage:

- `joker-pursuit.sound-enabled`
- `joker-pursuit.music-enabled`

Browser autoplay rules still apply. The music starts after the first user gesture on the home screen or after the user touches the audio controls.

## Future Asset Candidates

These are good licensing-friendly places to pull from if we later replace procedural sounds with recorded samples:

- Kenney UI Audio: CC0, useful for button and menu sweeteners.
- OpenGameArt CC0 Music collection: contains lounge/menu candidates, including elevator-music style tracks.
- Directory.Audio wood tapping/wooden sounds: individual CC0 wood foley candidates, but downloads may require login.
- Mixkit wood sounds: high-quality wood foley under the Mixkit license, usable for many projects but not CC0.

If recorded samples are added, prefer short `.ogg` plus `.mp3` fallbacks under `public/audio/`, keep attribution/licensing notes in this file, and preserve the procedural generator as a fallback for offline or failed loads.
