import type { RoomTheme } from '@custom-tabletop/shared';
import { categoryOutput, categoryVolume } from './audioMix.js';
import { getAudioContext } from './sounds.js';

/**
 * The night outside, heard through the windows (docs/decisions.md, "Night
 * sounds"): wind in the trees, crickets, an owl now and then — and on
 * Halloween, an eerier wind and a wolf howling far off. Synthesized like
 * the fire (no audio assets), started on the first user gesture, in the
 * player's "Night outside" sound category (audioMix.ts). Loudest by a
 * window, faint anywhere else in the room.
 */

/** Loudest the night gets (at full volume), right by a window. */
const PEAK_GAIN = 0.16;
/** Past this distance (metres) from the nearest window, the night is at its floor. */
const FALLOFF_RANGE = 5;
/** Through closed windows it's still there, faintly, anywhere in the room. */
const ROOM_FLOOR = 0.22;

/** How loud the night is from `distance` metres to the nearest window. Pure. */
export function nightLoudness(distance: number): number {
  const t = Math.min(Math.max(distance / FALLOFF_RANGE, 0), 1);
  return ROOM_FLOOR + (1 - ROOM_FLOOR) * (1 - t) ** 2;
}

/** One cricket: its pitch, how often it chirps, and how many pulses a chirp has. */
export interface Cricket {
  pitch: number;
  interval: number;
  pulses: number;
  pan: number;
}

/** A small chorus of crickets, each its own voice; fewer on Halloween. */
export function crickets(theme: RoomTheme, random: () => number): Cricket[] {
  const count = theme === 'halloween' ? 2 : 4;
  return Array.from({ length: count }, () => ({
    pitch: 3900 + random() * 1300,
    interval: 0.55 + random() * 0.7,
    pulses: 2 + Math.floor(random() * 3),
    pan: random() * 1.6 - 0.8,
  }));
}

/** Waits (seconds) between the rarer calls: the owl, and Halloween's wolf. */
const OWL_EVERY: [number, number] = [22, 45];
const HOWL_EVERY: [number, number] = [30, 60];

function between([low, high]: [number, number]): number {
  return low + Math.random() * (high - low);
}

export class NightAmbience {
  private ctx: AudioContext | null = null;
  /** Everything goes through here: the loudness by the windows. */
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private loudness = 0;
  private gust = 0.5;
  private theme: RoomTheme = 'classic';
  private chorus: (Cricket & { next: number })[] = [];
  private nextOwl = between(OWL_EVERY) * 0.4;
  private nextHowl = between(HOWL_EVERY) * 0.4;

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

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(categoryOutput(ctx, 'night'));

    // Wind: four seconds of pink-ish noise, looped, through a band-pass
    // whose level the gusts move.
    const length = ctx.sampleRate * 4;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2) * 1.6;
    }
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = noise;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.6;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.windSource.connect(this.windFilter).connect(this.wind).connect(this.master);
    this.windSource.start();
    this.setTheme(this.theme);
  }

  /** Halloween: a lower, stronger wind, fewer crickets, and the wolf. */
  setTheme(theme: RoomTheme): void {
    this.theme = theme;
    if (this.windFilter && this.ctx) {
      this.windFilter.frequency.setTargetAtTime(
        theme === 'halloween' ? 320 : 560,
        this.ctx.currentTime,
        0.5,
      );
    }
    const now = this.ctx?.currentTime ?? 0;
    this.chorus = crickets(theme, Math.random).map((cricket) => ({
      ...cricket,
      next: now + Math.random() * cricket.interval,
    }));
  }

  /** Per frame: how far the listener is from the nearest window. */
  update(dt: number, windowDistance: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.wind) return;
    const target = categoryVolume('night') > 0 ? nightLoudness(windowDistance) : 0;
    this.loudness += (target - this.loudness) * Math.min(1, dt * 2);
    this.master.gain.setTargetAtTime(this.loudness * PEAK_GAIN, ctx.currentTime, 0.1);
    if (this.loudness < 0.01) return;

    // Gusts: a slow random walk of the wind's level.
    this.gust += (Math.random() - 0.5) * dt * 0.8;
    this.gust = Math.min(1, Math.max(0.15, this.gust));
    const windLevel = (this.theme === 'halloween' ? 0.75 : 0.45) * this.gust;
    this.wind.gain.setTargetAtTime(windLevel, ctx.currentTime, 0.4);

    const now = ctx.currentTime;
    for (const cricket of this.chorus) {
      if (now >= cricket.next) {
        this.chirp(cricket, now + 0.02);
        cricket.next = now + cricket.interval * (0.85 + Math.random() * 0.3);
      }
    }
    this.nextOwl -= dt;
    if (this.nextOwl <= 0) {
      this.nextOwl = between(OWL_EVERY);
      this.owl(now + 0.05);
    }
    if (this.theme === 'halloween') {
      this.nextHowl -= dt;
      if (this.nextHowl <= 0) {
        this.nextHowl = between(HOWL_EVERY);
        this.howl(now + 0.05);
      }
    }
  }

  /** A cricket's chirp: a few quick pulses of a high tone. */
  private chirp(cricket: Cricket, at: number): void {
    const ctx = this.ctx!;
    const tone = ctx.createOscillator();
    tone.frequency.value = cricket.pitch;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    for (let i = 0; i < cricket.pulses; i++) {
      const start = at + i * 0.042;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.006);
      gain.gain.linearRampToValueAtTime(0, start + 0.026);
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = cricket.pan;
    tone.connect(gain).connect(pan).connect(this.master!);
    tone.start(at);
    tone.stop(at + cricket.pulses * 0.042 + 0.05);
  }

  /** An owl, far off: "hoo… hoo-hoo… hoo". */
  private owl(at: number): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 900;
    soft.connect(pan).connect(this.master!);
    const pitch = 330 + Math.random() * 40;
    for (const [offset, length] of [
      [0, 0.42],
      [0.75, 0.18],
      [0.98, 0.3],
      [1.55, 0.5],
    ] as const) {
      const start = at + offset;
      const tone = ctx.createOscillator();
      tone.frequency.setValueAtTime(pitch * 1.04, start);
      tone.frequency.exponentialRampToValueAtTime(pitch * 0.94, start + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      tone.connect(gain).connect(soft);
      tone.start(start);
      tone.stop(start + length + 0.05);
    }
  }

  /** A wolf, far away: a long rising, wavering, falling howl, with an echo. */
  private howl(at: number): void {
    const ctx = this.ctx!;
    const duration = 3.4;
    const tone = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const base = 300 + Math.random() * 40;
    for (const [osc, scale] of [
      [tone, 1],
      [overtone, 2],
    ] as const) {
      osc.frequency.setValueAtTime(base * scale, at);
      osc.frequency.exponentialRampToValueAtTime(base * 1.75 * scale, at + 0.9);
      osc.frequency.setValueAtTime(base * 1.75 * scale, at + 2.1);
      osc.frequency.exponentialRampToValueAtTime(base * 1.2 * scale, at + duration);
    }
    // A slow waver on the held note.
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 5;
    const depth = ctx.createGain();
    depth.gain.value = 9;
    wobble.connect(depth);
    depth.connect(tone.frequency);
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, at);
    voice.gain.linearRampToValueAtTime(0.1, at + 0.5);
    voice.gain.setValueAtTime(0.1, at + 2.2);
    voice.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.25;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1400;
    // Far away: a quiet echo off the hills.
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.42;
    const echoGain = ctx.createGain();
    echoGain.gain.value = 0.35;
    tone.connect(voice);
    overtone.connect(overtoneGain).connect(voice);
    voice.connect(soft);
    soft.connect(this.master!);
    soft.connect(echo).connect(echoGain).connect(this.master!);
    for (const osc of [tone, overtone, wobble]) {
      osc.start(at);
      osc.stop(at + duration + 0.1);
    }
  }

  dispose(): void {
    this.windSource?.stop();
    this.windSource?.disconnect();
    this.master?.disconnect();
    this.windSource = null;
    this.master = null;
    this.wind = null;
    this.ctx = null;
  }
}
