import type { Weather } from '@custom-tabletop/shared';
import { categoryOutput, categoryVolume } from './audioMix.js';
import { getAudioContext } from './sounds.js';
import { throughWindow } from './spatialAudio.js';

/** Loudest the rain gets (full volume), right by an open window. */
const PEAK_GAIN = 0.3;
/** How far a window's sound carries into the room (metres) before it's at
 * the room's floor — the same shape as the night's (nightAmbience.ts). */
const FALLOFF_RANGE = 5;
const ROOM_FLOOR = 0.3;

/** What the rain sounds like from where you stand: how near the nearest
 * window is, and whether it's open (louder, brighter) or its curtains are
 * drawn (softer, duller). Pure. */
export function rainLoudness(distance: number, open: boolean, drawn: boolean): number {
  const t = Math.min(Math.max(distance / FALLOFF_RANGE, 0), 1);
  const near = ROOM_FLOOR + (1 - ROOM_FLOOR) * (1 - t) ** 2;
  return near * throughWindow(open, drawn);
}

/**
 * Rain on the windows and the roof, and thunder rolling in after lightning
 * (docs/decisions.md, "The cozy room, lived in"). Synthesized like the fire and the
 * night: noise shaped into a steady hiss plus the patter of heavy drops,
 * and a long low rumble for thunder. In the player's "Rain & thunder" sound
 * category (audioMix.ts).
 */
export class WeatherAudio {
  private ctx: AudioContext | null = null;
  private hiss: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private weather: Weather = 'clear';
  private level = 0;
  private hearing = { distance: 10, open: false, drawn: false };

  /** Call from a user gesture (a click, a key press). Safe to call again. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) return;
    this.ctx = ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    // Three seconds of pinkish noise, looped: the steady sound of rain.
    const length = ctx.sampleRate * 3;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + white * 0.08;
      b1 = 0.6 * b1 + white * 0.4;
      data[i] = (b0 + b1) * 0.6;
    }
    this.noise = noise;
    this.source = ctx.createBufferSource();
    this.source.buffer = noise;
    this.source.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 400;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 5000;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    this.source
      .connect(high)
      .connect(this.tone)
      .connect(this.hiss)
      .connect(categoryOutput(ctx, 'weather'));
    this.source.start();
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
  }

  /** Per frame: the nearest window, and whether it's open or curtained. */
  update(dt: number, distance: number, open: boolean, drawn: boolean): void {
    this.hearing = { distance, open, drawn };
    const ctx = this.ctx;
    if (!ctx || !this.hiss || !this.tone) return;
    const raining = this.weather === 'rain' ? 0.6 : this.weather === 'storm' ? 1 : 0;
    // The rain comes in and eases off over several seconds.
    this.level += (raining - this.level) * Math.min(1, dt * 0.35);
    const audible = categoryVolume('weather') > 0;
    const loud = audible ? this.level * rainLoudness(distance, open, drawn) : 0;
    this.hiss.gain.setTargetAtTime(loud * PEAK_GAIN * 0.6, ctx.currentTime, 0.2);
    // Open: bright and close; shut or curtained: duller, through the glass.
    this.tone.frequency.setTargetAtTime(open ? 7000 : drawn ? 1400 : 2800, ctx.currentTime, 0.3);
    // Heavy drops pattering on the sill and the glass.
    if (loud > 0.02 && this.noise && Math.random() < dt * 22 * this.level) {
      const at = ctx.currentTime + Math.random() * 0.05;
      const drop = ctx.createBufferSource();
      drop.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1800 + Math.random() * 3500;
      band.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(loud * PEAK_GAIN * (0.25 + Math.random() * 0.5), at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      drop.connect(band).connect(gain).connect(categoryOutput(ctx, 'weather'));
      drop.start(at, Math.random() * 2);
      drop.stop(at + 0.05);
    }
  }

  /** Thunder, `delay` seconds from now: a crack for a near strike, then a
   * long rolling rumble. Heard everywhere in the room, a little louder by a
   * window. */
  thunder(loudness: number, delay: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || categoryVolume('weather') === 0) return;
    const out = categoryOutput(ctx, 'weather');
    const at = ctx.currentTime + delay;
    const near = rainLoudness(this.hearing.distance, this.hearing.open, this.hearing.drawn);
    const peak = 0.5 * loudness * (0.7 + 0.3 * near);
    const length = 3.5 + loudness * 3;
    // The rumble: low noise, swelling and rolling (a few slow surges).
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    rumble.playbackRate.value = 0.35;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(420, at);
    low.frequency.exponentialRampToValueAtTime(90, at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.25);
    for (let i = 1; i <= 3; i++) {
      const surge = at + (length * i) / 4;
      gain.gain.exponentialRampToValueAtTime(peak * (0.45 + Math.random() * 0.4), surge - 0.3);
      gain.gain.exponentialRampToValueAtTime(peak * (0.7 - i * 0.15), surge);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    rumble.connect(low).connect(gain).connect(out);
    rumble.start(at, Math.random() * 2);
    rumble.stop(at + length + 0.1);
    // A near strike cracks first.
    if (loudness > 0.7) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = 'highpass';
      band.frequency.value = 900;
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(peak * 0.8, at);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      crack.connect(band).connect(crackGain).connect(out);
      crack.start(at);
      crack.stop(at + 0.4);
    }
  }

  dispose(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.hiss?.disconnect();
    this.source = null;
    this.hiss = null;
    this.ctx = null;
  }
}
