import { categoryOutput, categoryVolume } from './audioMix.js';
import { getAudioContext } from './sounds.js';

/** Loudest the fire gets (at full volume), right in front of it. */
const PEAK_GAIN = 0.22;
/** Past this distance (metres) the fire is at its room-filling floor. */
const FALLOFF_RANGE = 7;
/** A fire fills a small room: anywhere in it, it's at least this loud. It
 * used to fade to silence by 8 m — which left it at 2–7% at the table,
 * where players spend the game, so it seemed to "get lost". */
const ROOM_FLOOR = 0.3;

/** How loud the fire should be from `distance` metres away (measured
 * across the floor): full up close, easing down to a soft room-filling
 * murmur. Pure, for tests. */
export function fireLoudness(distance: number): number {
  const t = Math.min(Math.max(distance / FALLOFF_RANGE, 0), 1);
  return ROOM_FLOOR + (1 - ROOM_FLOOR) * (1 - t) ** 2;
}

/**
 * The fireplace's sound: a low, soft roar (filtered noise, looped) with
 * little crackles and pops on top, louder the closer you are. Synthesized
 * — no audio asset to ship. Starts on the first user gesture (browsers
 * don't allow audio before one) and plays in the player's "Fire" sound
 * category (audioMix.ts).
 */
export class FireAmbience {
  private ctx: AudioContext | null = null;
  private roar: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private crackleBuffer: AudioBuffer | null = null;
  private loudness = 0;
  /** How big the fire burns (room.ts `fireLevel`): a stoked fire roars. */
  private level = 1;

  setLevel(level: number): void {
    this.level = level;
  }

  /** Call from a user gesture (a click, a key press). Safe to call again. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }
    this.ctx = ctx;
    if (ctx.state === 'suspended') void ctx.resume();

    // Two seconds of brown-ish noise, looped, through a low-pass: the roar.
    const length = ctx.sampleRate * 2;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    this.source = ctx.createBufferSource();
    this.source.buffer = noise;
    this.source.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 520;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    this.source.connect(lowpass).connect(this.roar).connect(categoryOutput(ctx, 'fire'));
    this.source.start();

    const crackle = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.02), ctx.sampleRate);
    const crackleData = crackle.getChannelData(0);
    for (let i = 0; i < crackleData.length; i++) crackleData[i] = Math.random() * 2 - 1;
    this.crackleBuffer = crackle;
  }

  /** Per frame: how far the listener is from the fire. */
  update(dt: number, distance: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.roar) return;
    const target = categoryVolume('fire') > 0 ? fireLoudness(distance) : 0;
    // Smooth it, so walking past doesn't step the volume.
    this.loudness += (target - this.loudness) * Math.min(1, dt * 3);
    const roar = Math.min(1, Math.max(0, (this.level - 1) / 0.75));
    this.roar.gain.setTargetAtTime(
      this.loudness * PEAK_GAIN * 0.55 * (1 + 0.8 * roar),
      ctx.currentTime,
      0.1,
    );

    // Crackles: a few a second (more when it's just been stoked), random
    // pitch and size, louder up close.
    if (this.loudness > 0.02 && this.crackleBuffer && Math.random() < dt * 7 * (1 + 1.5 * roar)) {
      const at = ctx.currentTime + Math.random() * 0.05;
      const source = ctx.createBufferSource();
      source.buffer = this.crackleBuffer;
      source.playbackRate.value = 0.6 + Math.random() * 1.6;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900 + Math.random() * 3200;
      band.Q.value = 2.5;
      const gain = ctx.createGain();
      const peak = this.loudness * PEAK_GAIN * (Math.random() < 0.15 ? 1.4 : 0.55);
      gain.gain.setValueAtTime(peak, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.05);
      source.connect(band).connect(gain).connect(categoryOutput(ctx, 'fire'));
      source.start(at);
      source.stop(at + 0.12);
    }
  }

  dispose(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.roar?.disconnect();
    this.source = null;
    this.roar = null;
    this.ctx = null;
  }
}
