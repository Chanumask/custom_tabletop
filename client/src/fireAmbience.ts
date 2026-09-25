import { getAudioContext, getMasterVolume } from './sounds.js';

/** Loudest the fire gets (at master volume 1), right in front of it. */
const PEAK_GAIN = 0.22;
/** Beyond this distance (metres) the fire is silent. */
const HEARING_RANGE = 8;

/** How loud the fire should be from `distance` metres away: full up close,
 * falling off smoothly to nothing at `HEARING_RANGE`. Pure, for tests. */
export function fireLoudness(distance: number): number {
  const t = Math.min(Math.max(distance / HEARING_RANGE, 0), 1);
  return (1 - t) ** 2;
}

/**
 * The fireplace's sound: a low, soft roar (filtered noise, looped) with
 * little crackles and pops on top, louder the closer you are. Synthesized
 * — no audio asset to ship. Starts on the first user gesture (browsers
 * don't allow audio before one) and follows the master volume and the
 * "Fireplace sound" setting.
 */
export class FireAmbience {
  private ctx: AudioContext | null = null;
  private roar: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private crackleBuffer: AudioBuffer | null = null;
  private loudness = 0;

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
    this.source.connect(lowpass).connect(this.roar).connect(ctx.destination);
    this.source.start();

    const crackle = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.02), ctx.sampleRate);
    const crackleData = crackle.getChannelData(0);
    for (let i = 0; i < crackleData.length; i++) crackleData[i] = Math.random() * 2 - 1;
    this.crackleBuffer = crackle;
  }

  /** Per frame: how far the listener is from the fire, and whether the
   * player wants to hear it. */
  update(dt: number, distance: number, enabled: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.roar) return;
    const target = enabled ? fireLoudness(distance) * getMasterVolume() : 0;
    // Smooth it, so walking past doesn't step the volume.
    this.loudness += (target - this.loudness) * Math.min(1, dt * 3);
    this.roar.gain.setTargetAtTime(this.loudness * PEAK_GAIN * 0.55, ctx.currentTime, 0.1);

    // Crackles: a few a second, random pitch and size, louder up close.
    if (this.loudness > 0.02 && this.crackleBuffer && Math.random() < dt * 7) {
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
      source.connect(band).connect(gain).connect(ctx.destination);
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
