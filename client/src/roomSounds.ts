import { categoryOutput, type SoundCategory } from './audioMix.js';
import { audioFor } from './sounds.js';
import type { Placement } from './spatialAudio.js';

/**
 * The room's small sounds, synthesized like the fire and the night (no
 * audio assets): footsteps on the boards, the grandfather clock's tick and
 * chime, a knock at the door and the door itself. Each takes a `Placement`
 * (spatialAudio.ts) — how loud and how far left/right — so it sounds from
 * where it happens.
 */

let noiseBuffer: AudioBuffer | null = null;

/** Half a second of white noise, made once and reused by every sound here. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** A context and an output placed per `place`, or null when there's
 * nothing to play (no Web Audio, the category off, too far to hear). */
function voice(
  category: SoundCategory,
  place: Placement,
): { ctx: AudioContext; out: AudioNode } | null {
  if (place.volume < 0.005) return null;
  const ctx = audioFor(category);
  if (!ctx) return null;
  const gain = ctx.createGain();
  gain.gain.value = place.volume;
  const pan = ctx.createStereoPanner();
  pan.pan.value = place.pan;
  gain.connect(pan).connect(categoryOutput(ctx, category));
  return { ctx, out: gain };
}

/** A filtered noise burst: `type`/`frequency`/`q` shape it, `peak` and
 * `length` (seconds) how loud and how long. */
function burst(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  peak: number,
  length: number,
): void {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.006, length / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(out);
  source.start(at, Math.random() * 0.3);
  source.stop(at + length + 0.02);
}

/** A sine that drops in pitch as it fades — the body of a thump. */
function thump(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  from: number,
  to: number,
  peak: number,
  length: number,
): void {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export type FloorSurface = 'wood' | 'rug';

/** One footstep: a soft heel on old floorboards (now and then a creak), or
 * a muffled pad on a rug. Running lands a little harder. */
export function playFootstep(place: Placement, surface: FloorSurface, running: boolean): void {
  const v = voice('footsteps', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.005;
  const force = running ? 1.35 : 1;
  if (surface === 'rug') {
    burst(ctx, out, at, 'lowpass', 380, 0.7, 0.09 * force, 0.07);
    thump(ctx, out, at, 90, 55, 0.07 * force, 0.07);
    return;
  }
  burst(ctx, out, at, 'bandpass', 520 + Math.random() * 260, 1.1, 0.1 * force, 0.05);
  thump(ctx, out, at, 120, 70, 0.11 * force, 0.08);
  // An old board giving a little under the weight.
  if (Math.random() < 0.09) {
    const creak = ctx.createOscillator();
    creak.type = 'sawtooth';
    const start = at + 0.03;
    const pitch = 180 + Math.random() * 160;
    creak.frequency.setValueAtTime(pitch, start);
    creak.frequency.linearRampToValueAtTime(pitch * (1.15 + Math.random() * 0.2), start + 0.25);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.018, start + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    creak.connect(band).connect(gain).connect(out);
    creak.start(start);
    creak.stop(start + 0.3);
  }
}

/** The grandfather clock's escapement: "tick" on even seconds, a slightly
 * lower "tock" on odd ones. */
export function playTick(place: Placement, tock: boolean): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.005;
  burst(ctx, out, at, 'bandpass', tock ? 2300 : 2900, 6, 0.09, 0.025);
  burst(ctx, out, at, 'bandpass', tock ? 780 : 900, 3, 0.05, 0.05);
}

/** One strike of the clock's chime: a deep bell, rich and slow to fade. */
export function playChimeStrike(place: Placement, delay = 0): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.01 + delay;
  const base = 146.8; // D3
  const partials: [number, number, number][] = [
    [0.5, 0.05, 5.5], // the hum
    [1, 0.12, 4.2],
    [2, 0.06, 3],
    [2.4, 0.045, 2.4],
    [3, 0.035, 2],
    [4.2, 0.02, 1.4],
    [5.4, 0.012, 1],
  ];
  for (const [ratio, peak, length] of partials) {
    const osc = ctx.createOscillator();
    osc.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
  burst(ctx, out, at, 'bandpass', 2600, 2, 0.05, 0.03); // the hammer
}

/** Three knocks on the door, the last one a touch softer. */
export function playKnock(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const start = ctx.currentTime + 0.02;
  [0, 0.24, 0.46].forEach((offset, i) => {
    const at = start + offset;
    const force = i === 2 ? 0.8 : 1;
    thump(ctx, out, at, 150, 85, 0.35 * force, 0.12);
    burst(ctx, out, at, 'bandpass', 420, 1.4, 0.3 * force, 0.07);
    burst(ctx, out, at, 'highpass', 2500, 0.7, 0.05 * force, 0.02);
  });
}

/** An old door swinging open: a slow, uneven creak of the hinges. */
export function playDoorCreak(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.02;
  const length = 0.9;
  const creak = ctx.createOscillator();
  creak.type = 'sawtooth';
  creak.frequency.setValueAtTime(95, at);
  creak.frequency.linearRampToValueAtTime(150, at + length * 0.4);
  creak.frequency.linearRampToValueAtTime(120, at + length);
  // The stick-slip of a dry hinge: a fast wobble on the pitch.
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 23;
  const depth = ctx.createGain();
  depth.gain.value = 18;
  wobble.connect(depth).connect(creak.frequency);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1100;
  band.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(0.05, at + 0.15);
  gain.gain.setValueAtTime(0.05, at + length * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  creak.connect(band).connect(gain).connect(out);
  for (const osc of [creak, wobble]) {
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/** The door falling shut: a soft wooden thud and the latch clicking. */
export function playDoorClose(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.02;
  thump(ctx, out, at, 110, 55, 0.3, 0.22);
  burst(ctx, out, at, 'lowpass', 700, 0.8, 0.18, 0.12);
  burst(ctx, out, at + 0.07, 'bandpass', 3200, 5, 0.08, 0.02);
}

/** A light switch or a lamp's switch clicking over. */
export function playSwitchClick(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.005;
  burst(ctx, out, at, 'bandpass', 3400, 4, 0.12, 0.018);
  burst(ctx, out, at + 0.012, 'bandpass', 1800, 3, 0.06, 0.03);
}

/** A log dropped on the fire: a wooden clunk, the flames taking it with a
 * rush, and a burst of crackles. */
export function playLogOnFire(place: Placement): void {
  const v = voice('fire', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.02;
  thump(ctx, out, at, 130, 60, 0.35, 0.2);
  burst(ctx, out, at, 'lowpass', 600, 0.7, 0.2, 0.15);
  // The rush of air as it catches: a slow swell of low noise.
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(300, at + 0.2);
  low.frequency.linearRampToValueAtTime(900, at + 1.1);
  const swell = ctx.createGain();
  swell.gain.setValueAtTime(0.0001, at + 0.2);
  swell.gain.exponentialRampToValueAtTime(0.16, at + 0.9);
  swell.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
  source.connect(low).connect(swell).connect(out);
  source.start(at + 0.2);
  source.stop(at + 2.5);
  for (let i = 0; i < 9; i++) {
    burst(
      ctx,
      out,
      at + 0.3 + Math.random() * 1.6,
      'bandpass',
      900 + Math.random() * 3000,
      2.5,
      0.1 + Math.random() * 0.12,
      0.03 + Math.random() * 0.04,
    );
  }
}

/** Blowing a candle out: a short breath. */
export function playBlowOut(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.01;
  burst(ctx, out, at, 'bandpass', 1500, 0.8, 0.14, 0.32);
  burst(ctx, out, at, 'lowpass', 500, 0.7, 0.06, 0.25);
}

/** Lighting a candle: a match struck along the box, then it flares. */
export function playMatchStrike(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.01;
  burst(ctx, out, at, 'highpass', 2600, 0.7, 0.12, 0.12);
  burst(ctx, out, at + 0.1, 'bandpass', 900, 0.9, 0.12, 0.35);
}

/** A window swinging open (a wooden scrape and the latch) or shut (a knock
 * into the frame). */
export function playWindowSwing(place: Placement, opening: boolean): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.01;
  burst(ctx, out, at, 'bandpass', 3000, 5, 0.08, 0.03); // the latch
  if (opening) {
    burst(ctx, out, at + 0.05, 'bandpass', 700, 1.2, 0.07, 0.45);
  } else {
    burst(ctx, out, at + 0.6, 'lowpass', 900, 0.8, 0.14, 0.1);
    thump(ctx, out, at + 0.6, 140, 80, 0.12, 0.12);
  }
}

/** Curtains drawn along their rod: fabric sweeping and the rings sliding. */
export function playCurtains(place: Placement): void {
  const v = voice('room', place);
  if (!v) return;
  const { ctx, out } = v;
  const at = ctx.currentTime + 0.01;
  burst(ctx, out, at, 'bandpass', 2400, 0.6, 0.06, 0.9);
  for (let i = 0; i < 6; i++) {
    burst(ctx, out, at + i * 0.12 + Math.random() * 0.04, 'bandpass', 4200, 8, 0.03, 0.03);
  }
}
