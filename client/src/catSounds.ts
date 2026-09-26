import { categoryOutput } from './audioMix.js';
import { audioFor } from './sounds.js';
import type { Placement } from './spatialAudio.js';

/** How loud the purr is asleep (close by), and while being stroked. */
const ASLEEP = 0.035;
const STROKED = 0.13;

/**
 * The cat's voice (RoomCat.ts), synthesized like the room's other sounds:
 * a purr — rough breath pulsing twenty-odd times a second, swelling as it
 * breathes out — heard only close by while it sleeps and warmly while it's
 * stroked; and a little "mrrp". In the player's "Room sounds" category.
 */
export class CatPurr {
  private ctx: AudioContext | null = null;
  private level: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private stroked = 0;

  /** Starts the purr (silent until `update` says how loud). */
  start(): void {
    if (this.ctx) return;
    const ctx = audioFor('room');
    if (!ctx) return;
    this.ctx = ctx;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const throat = ctx.createBiquadFilter();
    throat.type = 'bandpass';
    throat.frequency.value = 190;
    throat.Q.value = 0.9;
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 700;
    // The purr's flutter: the level pulsing ~26 times a second.
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const flutter = ctx.createOscillator();
    flutter.type = 'triangle';
    flutter.frequency.value = 26;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.5;
    flutter.connect(flutterDepth).connect(pulse.gain);
    // Breathing: in, out, a little louder going out.
    const breath = ctx.createGain();
    breath.gain.value = 0.65;
    const breathing = ctx.createOscillator();
    breathing.frequency.value = 0.42;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.35;
    breathing.connect(breathDepth).connect(breath.gain);
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    source.connect(throat).connect(warmth).connect(pulse).connect(breath).connect(this.level);
    this.level.connect(this.pan).connect(categoryOutput(ctx, 'room'));
    this.sources = [source, flutter, breathing];
    this.sources.forEach((node) => node.start());
  }

  /** Stroked just now: purring properly for a few seconds. */
  pet(): void {
    this.stroked = 1;
  }

  /** Per frame: where the cat is from the listener. */
  update(dt: number, place: Placement): void {
    const ctx = this.ctx;
    if (!ctx || !this.level || !this.pan) return;
    this.stroked = Math.max(0, this.stroked - dt / 4.5);
    const loudness = place.volume * (ASLEEP + (STROKED - ASLEEP) * Math.min(1, this.stroked * 1.5));
    this.level.gain.setTargetAtTime(loudness, ctx.currentTime, 0.25);
    this.pan.pan.setTargetAtTime(place.pan, ctx.currentTime, 0.2);
  }

  dispose(): void {
    this.sources.forEach((node) => node.stop());
    this.sources = [];
    this.level?.disconnect();
    this.ctx = null;
  }
}

/** A cat's little questioning trill: "mrrp?" */
export function playMrrp(place: Placement): void {
  if (place.volume < 0.005) return;
  const ctx = audioFor('room');
  if (!ctx) return;
  const at = ctx.currentTime + 0.05;
  const out = ctx.createGain();
  out.gain.value = place.volume;
  const pan = ctx.createStereoPanner();
  pan.pan.value = place.pan;
  out.connect(pan).connect(categoryOutput(ctx, 'room'));
  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(420, at);
  voice.frequency.linearRampToValueAtTime(560, at + 0.12);
  voice.frequency.linearRampToValueAtTime(470, at + 0.28);
  // The trill: a quick flutter at the start.
  const trill = ctx.createOscillator();
  trill.frequency.value = 32;
  const trillDepth = ctx.createGain();
  trillDepth.gain.setValueAtTime(0.5, at);
  trillDepth.gain.linearRampToValueAtTime(0, at + 0.1);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.05, at + 0.03);
  level.gain.setValueAtTime(0.05, at + 0.2);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
  trill.connect(trillDepth).connect(level.gain);
  // Two formants make it a "mrr" rather than a buzz.
  for (const [hz, q, gain] of [
    [900, 4, 1],
    [2300, 6, 0.4],
  ] as const) {
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = hz;
    formant.Q.value = q;
    const formantGain = ctx.createGain();
    formantGain.gain.value = gain;
    voice.connect(formant).connect(formantGain).connect(level);
  }
  level.connect(out);
  voice.start(at);
  trill.start(at);
  voice.stop(at + 0.4);
  trill.stop(at + 0.4);
}
