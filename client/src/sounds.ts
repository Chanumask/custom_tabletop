import type { SoundState } from '@custom-tabletop/shared';

interface ToneParams {
  frequency: number;
  waveform: OscillatorType;
  durationMs: number;
}

/**
 * Synthesis parameters for the built-in presets, keyed by id. The server
 * only knows a preset's id/name (`shared/src/types.ts`'s
 * `BUILTIN_SOUND_PRESETS`, seeded into every session's `GameState.soundboard`
 * — Milestone 8); how to actually synthesize one with the Web Audio API is
 * a client-only concern, the same placeholder-quality tradeoff as colored
 * capsule avatars instead of real character models.
 */
const TONE_PARAMS: Record<string, ToneParams> = {
  bell: { frequency: 880, waveform: 'sine', durationMs: 600 },
  drum: { frequency: 110, waveform: 'triangle', durationMs: 250 },
  alert: { frequency: 440, waveform: 'square', durationMs: 400 },
};

// Lazily created and reused (not one per play) — avoids leaking
// AudioContext instances and lets `.resume()` handle the browser autoplay
// policy uniformly regardless of when a tone is first triggered.
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  sharedContext ??= new AudioContext();
  return sharedContext;
}

function playTone(params: ToneParams): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = params.waveform;
  oscillator.frequency.value = params.frequency;

  const durationSeconds = params.durationMs / 1000;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationSeconds);
}

function playUploadedAudio(url: string): void {
  const audio = new Audio(url);
  void audio.play().catch((error: unknown) => {
    console.error('Failed to play uploaded sound:', error);
  });
}

/**
 * Plays one soundboard entry (Milestone 8): a built-in preset (`url` empty
 * — synthesized locally via `TONE_PARAMS`, matched by `id`) or a player's
 * uploaded file (`url` set — played through a plain `<audio>` element).
 * Silently does nothing for an unrecognized built-in id (shouldn't happen
 * since the server only ever hands back ids it put there itself, but this
 * stays a no-op rather than a throw either way).
 */
export function playSound(entry: SoundState): void {
  if (entry.url) {
    playUploadedAudio(entry.url);
    return;
  }

  const params = TONE_PARAMS[entry.id];
  if (params) {
    playTone(params);
  }
}
