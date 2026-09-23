export interface SoundPreset {
  id: string;
  name: string;
  frequency: number;
  waveform: OscillatorType;
  durationMs: number;
}

/**
 * A small fixed soundboard catalog, synthesized with the Web Audio API
 * rather than shipped as audio files (Milestone 7) — no real sound assets
 * are available in this project, and generating a tone needs nothing but a
 * frequency/waveform/duration, the same placeholder-quality tradeoff as
 * colored capsule avatars instead of real character models.
 */
export const SOUND_PRESETS: SoundPreset[] = [
  { id: 'bell', name: 'Bell', frequency: 880, waveform: 'sine', durationMs: 600 },
  { id: 'drum', name: 'Drum', frequency: 110, waveform: 'triangle', durationMs: 250 },
  { id: 'alert', name: 'Alert', frequency: 440, waveform: 'square', durationMs: 400 },
];

// Lazily created and reused (not one per play) — avoids leaking
// AudioContext instances and lets `.resume()` handle the browser autoplay
// policy uniformly regardless of when a tone is first triggered.
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  sharedContext ??= new AudioContext();
  return sharedContext;
}

/** Plays a preset tone by id. Silently does nothing for an unknown id —
 * the server only relays soundId, it doesn't validate it against this
 * client-side catalog. */
export function playSoundPreset(soundId: string): void {
  const preset = SOUND_PRESETS.find((candidate) => candidate.id === soundId);
  if (!preset) {
    return;
  }

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = preset.waveform;
  oscillator.frequency.value = preset.frequency;

  const durationSeconds = preset.durationMs / 1000;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationSeconds);
}
