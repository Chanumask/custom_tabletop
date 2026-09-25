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

type AudioContextConstructor = new () => AudioContext;

/** The shared audio context — or null in a browser without Web Audio (some
 * embedded/test WebKit builds, older Safari without the unprefixed name
 * falls back to `webkitAudioContext`): sounds then just don't play,
 * instead of throwing. */
export function getAudioContext(): AudioContext | null {
  if (!sharedContext) {
    const scope = globalThis as {
      AudioContext?: AudioContextConstructor;
      webkitAudioContext?: AudioContextConstructor;
    };
    const Context = scope.AudioContext ?? scope.webkitAudioContext;
    if (!Context) {
      return null;
    }
    sharedContext = new Context();
  }
  return sharedContext;
}

// The peak gain a tone plays at when masterVolume is 1 — kept well under
// 1.0 so even full volume doesn't clip.
const TONE_PEAK_GAIN = 0.2;

// Client-only preference (settings.ts), applied here rather than threaded
// as a parameter through every playSound call site — App.tsx syncs this
// from SettingsContext whenever the player changes it.
let masterVolume = 1;

/** Sets the volume every subsequent `playSound` call uses, for both
 * synthesized tones and uploaded/linked audio. Clamped to [0, 1] — a
 * malformed/out-of-range value from a future settings-import feature
 * shouldn't be able to blow out a player's speakers. */
/** The volume every sound currently plays at (0..1). */
export function getMasterVolume(): number {
  return masterVolume;
}

export function setMasterVolume(volume: number): void {
  masterVolume = Math.min(1, Math.max(0, volume));
}

function playTone(params: ToneParams): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = params.waveform;
  oscillator.frequency.value = params.frequency;

  const durationSeconds = params.durationMs / 1000;
  const peakGain = TONE_PEAK_GAIN * masterVolume;
  gain.gain.setValueAtTime(peakGain, ctx.currentTime);
  // A zero peak (volume all the way down) can't be ramped to
  // exponentially — go silent immediately instead of throwing.
  if (peakGain > 0) {
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds);
  }

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationSeconds);
}

function playAudioFile(url: string): Promise<void> {
  const audio = new Audio(url);
  audio.volume = masterVolume;
  return audio.play();
}

/**
 * Plays one soundboard entry: a built-in preset (`url` empty — synthesized
 * locally via `TONE_PARAMS`, matched by `id`) or an audio file (an upload
 * or a direct link — played through a plain `<audio>` element). YouTube
 * clips never come through here — they're shown in a visible player
 * instead (YouTubeClip.tsx). Resolves once playback starts; rejects if it
 * can't (a dead link, a blocked autoplay), so the caller can tell the
 * player instead of leaving them wondering why nothing was heard.
 */
export function playSound(entry: SoundState): Promise<void> {
  if (entry.url) {
    return playAudioFile(entry.url);
  }

  const params = TONE_PARAMS[entry.id];
  if (params) {
    playTone(params);
  }
  return Promise.resolve();
}

// How loud one die's clatter peaks at masterVolume 1 (several dice add up).
const CLATTER_PEAK_GAIN = 0.35;

/**
 * The sound of dice tumbling on the table: per die, a few short, filtered
 * noise clicks that come faster and softer as it settles — synthesized, so
 * there's no audio asset to ship. Timed to `DiceManager`'s tumble.
 */
export function playDiceClatter(diceCount: number, durationSeconds: number): void {
  if (masterVolume === 0 || diceCount === 0) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.03), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }

  const start = ctx.currentTime + 0.02;
  const perDie = CLATTER_PEAK_GAIN / Math.sqrt(Math.min(diceCount, 8));
  for (let die = 0; die < Math.min(diceCount, 8); die++) {
    let at = start + Math.random() * 0.06;
    let gap = 0.16 + Math.random() * 0.06;
    let loudness = 1;
    while (at < start + durationSeconds && loudness > 0.08) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800 + Math.random() * 2600;
      filter.Q.value = 4;
      const gain = ctx.createGain();
      const peak = perDie * loudness * masterVolume;
      gain.gain.setValueAtTime(peak, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(at);
      source.stop(at + 0.03);

      at += gap;
      gap *= 0.72; // bounces come quicker as it settles...
      loudness *= 0.7; // ...and softer
    }
  }
}

/** A soft two-note chime for a ping on the table ("look here!"). */
export function playPingSound(): void {
  if (masterVolume === 0) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const start = ctx.currentTime + 0.01;
  [880, 1320].forEach((frequency, index) => {
    const at = start + index * 0.09;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12 * masterVolume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.36);
  });
}

/** The camera's shutter click (gadgets phase 2) — two very short, high
 * square-wave clicks, a mechanical "clack-clack" rather than a musical
 * tone. */
export function playShutterSound(): void {
  if (masterVolume === 0) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const start = ctx.currentTime + 0.01;
  [0, 0.05].forEach((offset) => {
    const at = start + offset;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1800;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.16 * masterVolume, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.06);
  });
}
