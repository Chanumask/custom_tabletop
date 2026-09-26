import type { Instrument, NoteEvent } from './songs.js';

/**
 * The record player's band, synthesized (no audio files, like the fire and
 * the night): a few oscillators and filtered noise per note, shaped by
 * envelopes. Each `play` schedules one note at `at` (AudioContext time) into
 * `out`; `wobble`, if given, bends every pitched voice a touch — a record's
 * gentle warble.
 */

export interface Band {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** A slow, tiny pitch drift (cents) fed into every oscillator's detune. */
  wobble: AudioNode | null;
}

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.5), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Attack to `peak`, hold, then fall away over `release` (all seconds). */
function envelope(
  param: AudioParam,
  at: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): number {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  param.setValueAtTime(Math.max(peak, 0.0002), at + attack + hold);
  param.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return at + attack + hold + release;
}

/** A struck or plucked note: straight up, then dying away, faster at first. */
function decay(
  param: AudioParam,
  at: number,
  peak: number,
  attack: number,
  length: number,
): number {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  param.setTargetAtTime(0.0001, at + attack, length / 4);
  return at + attack + length * 1.3;
}

function oscillator(band: Band, type: OscillatorType, hz: number, detune = 0): OscillatorNode {
  const osc = band.ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = hz;
  osc.detune.value = detune;
  const wobble = band.wobble;
  if (wobble) {
    wobble.connect(osc.detune);
    // Let go once it's done, or the warble would keep every note alive.
    osc.onended = () => wobble.disconnect(osc.detune);
  }
  return osc;
}

function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  hz: number,
  q = 0.7,
): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = hz;
  node.Q.value = q;
  return node;
}

function run(nodes: AudioScheduledSourceNode[], at: number, until: number): void {
  for (const node of nodes) {
    node.start(at);
    node.stop(until + 0.05);
  }
}

/** A burst of filtered noise: drums, brushes, breath. */
function hiss(
  band: Band,
  at: number,
  shape: BiquadFilterNode[],
  peak: number,
  attack: number,
  length: number,
  out: AudioNode = band.out,
): void {
  const { ctx } = band;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const gain = ctx.createGain();
  const end = decay(gain.gain, at, peak, attack, length);
  let chain: AudioNode = source;
  for (const node of shape) chain = chain.connect(node);
  chain.connect(gain).connect(out);
  source.start(at, Math.random() * 0.5);
  source.stop(end + 0.05);
}

export function play(band: Band, event: NoteEvent, at: number): void {
  VOICES[event.instrument](band, event, at);
}

const VOICES: Record<Instrument, (band: Band, event: NoteEvent, at: number) => void> = {
  // --- Tavern Night -------------------------------------------------------
  lute(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const body = filter(ctx, 'lowpass', hz * 6, 1.2);
    body.frequency.setValueAtTime(Math.min(hz * 9, 7000), at);
    body.frequency.exponentialRampToValueAtTime(Math.max(hz * 1.5, 300), at + 0.35);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, 0.2 * velocity, 0.003, Math.max(length, 0.8));
    const a = oscillator(band, 'sawtooth', hz, -4);
    const b = oscillator(band, 'triangle', hz, 5);
    a.connect(body);
    b.connect(body);
    body.connect(gain).connect(band.out);
    run([a, b], at, end);
  },

  fiddle(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const tone = filter(ctx, 'lowpass', 2600, 0.9);
    const resonance = filter(ctx, 'peaking', 1100, 1.2);
    resonance.gain.value = 5;
    const gain = ctx.createGain();
    const end = envelope(
      gain.gain,
      at,
      0.19 * velocity,
      0.045,
      Math.max(length - 0.08, 0.02),
      0.12,
    );
    const a = oscillator(band, 'sawtooth', hz, -5);
    const b = oscillator(band, 'sawtooth', hz, 6);
    // Vibrato that comes in once the note has settled.
    const vibrato = oscillator(band, 'sine', 5.6);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(14, at + Math.min(0.25, length));
    vibrato.connect(depth);
    depth.connect(a.detune);
    depth.connect(b.detune);
    a.connect(tone);
    b.connect(tone);
    tone.connect(resonance).connect(gain).connect(band.out);
    run([a, b, vibrato], at, end);
    // The bow on the string.
    hiss(band, at, [filter(ctx, 'bandpass', 3200, 1.5)], 0.02 * velocity, 0.03, length);
  },

  whistle(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const gain = ctx.createGain();
    const end = envelope(gain.gain, at, 0.16 * velocity, 0.03, Math.max(length - 0.06, 0.02), 0.08);
    const pure = oscillator(band, 'sine', hz);
    const edge = oscillator(band, 'triangle', hz * 2);
    const edgeGain = ctx.createGain();
    edgeGain.gain.value = 0.12;
    const vibrato = oscillator(band, 'sine', 5.2);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(9, at + Math.min(0.3, length));
    vibrato.connect(depth);
    depth.connect(pure.detune);
    pure.connect(gain);
    edge.connect(edgeGain).connect(gain);
    gain.connect(band.out);
    run([pure, edge, vibrato], at, end);
    hiss(band, at, [filter(ctx, 'highpass', 5000)], 0.02 * velocity, 0.02, Math.min(length, 0.25));
  },

  folkBass(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const tone = filter(ctx, 'lowpass', 900, 1);
    tone.frequency.setValueAtTime(1100, at);
    tone.frequency.exponentialRampToValueAtTime(260, at + 0.4);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, 0.26 * velocity, 0.005, Math.max(length, 0.9));
    const osc = oscillator(band, 'triangle', hz);
    const sub = oscillator(band, 'sine', hz / 2);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    osc.connect(tone);
    sub.connect(subGain).connect(tone);
    tone.connect(gain).connect(band.out);
    run([osc, sub], at, end);
  },

  bodhran(band, { midi, velocity }, at) {
    const { ctx } = band;
    // midi 0: the deep open stroke; 1: a light tap near the rim.
    const deep = midi === 0;
    const osc = oscillator(band, 'sine', deep ? 105 : 170);
    osc.frequency.setValueAtTime(deep ? 105 : 170, at);
    osc.frequency.exponentialRampToValueAtTime(deep ? 58 : 120, at + 0.18);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, (deep ? 0.4 : 0.2) * velocity, 0.004, deep ? 0.32 : 0.12);
    osc.connect(gain).connect(band.out);
    run([osc], at, end);
    hiss(band, at, [filter(ctx, 'lowpass', deep ? 900 : 2200)], 0.12 * velocity, 0.002, 0.06);
  },

  tambourine(band, { velocity }, at) {
    const { ctx } = band;
    for (let i = 0; i < 3; i++) {
      hiss(
        band,
        at + i * 0.018,
        [filter(ctx, 'bandpass', 7800, 2.5), filter(ctx, 'highpass', 5000)],
        0.42 * velocity * (1 - i * 0.25),
        0.002,
        0.14,
      );
    }
  },

  // --- Lo-fi Evening -----------------------------------------------------
  rhodes(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const gain = ctx.createGain();
    const hold = Math.max(length, 0.3);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.26 * velocity, at + 0.008);
    gain.gain.setTargetAtTime(0.12 * velocity, at + 0.01, 0.4);
    gain.gain.setTargetAtTime(0.0001, at + hold, 0.18);
    const end = at + hold + 0.8;
    const fundamental = oscillator(band, 'sine', hz);
    const warm = oscillator(band, 'triangle', hz, 7);
    const warmGain = ctx.createGain();
    warmGain.gain.value = 0.3;
    // The tine's bell, gone in a moment.
    const tine = oscillator(band, 'sine', hz * 7.02);
    const tineGain = ctx.createGain();
    decay(tineGain.gain, at, 0.18, 0.002, 0.18);
    // A slow tremolo, like an old electric piano's.
    const tremolo = oscillator(band, 'sine', 4.2);
    const tremoloDepth = ctx.createGain();
    tremoloDepth.gain.value = 0.18;
    const level = ctx.createGain();
    level.gain.value = 1;
    tremolo.connect(tremoloDepth).connect(level.gain);
    fundamental.connect(gain);
    warm.connect(warmGain).connect(gain);
    tine.connect(tineGain).connect(gain);
    gain.connect(level).connect(band.out);
    run([fundamental, warm, tine, tremolo], at, end);
  },

  keys(band, event, at) {
    // The tune on top: the same electric piano, a little brighter.
    VOICES.rhodes(band, { ...event, velocity: event.velocity * 1.3 }, at);
  },

  subBass(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const tone = filter(ctx, 'lowpass', 420, 0.8);
    const gain = ctx.createGain();
    const end = envelope(
      gain.gain,
      at,
      0.15 * velocity,
      0.012,
      Math.max(length - 0.15, 0.05),
      0.22,
    );
    const osc = oscillator(band, 'sine', hz);
    const edge = oscillator(band, 'triangle', hz);
    const edgeGain = ctx.createGain();
    edgeGain.gain.value = 0.25;
    osc.connect(tone);
    edge.connect(edgeGain).connect(tone);
    tone.connect(gain).connect(band.out);
    run([osc, edge], at, end);
  },

  kick(band, { velocity }, at) {
    const { ctx } = band;
    const osc = oscillator(band, 'sine', 120);
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, 0.7 * velocity, 0.003, 0.35);
    osc.connect(gain).connect(band.out);
    run([osc], at, end);
    hiss(band, at, [filter(ctx, 'lowpass', 1400)], 0.05 * velocity, 0.001, 0.02);
  },

  snare(band, { velocity }, at) {
    const { ctx } = band;
    // Soft and dusty: the wires, a little body, and it's all rolled off.
    hiss(
      band,
      at,
      [filter(ctx, 'bandpass', 1900, 0.8), filter(ctx, 'lowpass', 4200)],
      0.55 * velocity,
      0.002,
      0.22,
    );
    const osc = oscillator(band, 'triangle', 190);
    osc.frequency.setValueAtTime(190, at);
    osc.frequency.exponentialRampToValueAtTime(150, at + 0.08);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, 0.2 * velocity, 0.002, 0.12);
    osc.connect(gain).connect(band.out);
    run([osc], at, end);
  },

  hat(band, { velocity }, at) {
    hiss(
      band,
      at,
      [filter(band.ctx, 'highpass', 6000), filter(band.ctx, 'lowpass', 10000)],
      0.42 * velocity,
      0.001,
      0.05,
    );
  },

  openHat(band, { velocity }, at) {
    hiss(
      band,
      at,
      [filter(band.ctx, 'highpass', 5500), filter(band.ctx, 'lowpass', 10000)],
      0.45 * velocity,
      0.002,
      0.45,
    );
  },

  // --- Rain Jazz -----------------------------------------------------------
  upright(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const tone = filter(ctx, 'lowpass', 1000, 1.4);
    tone.frequency.setValueAtTime(1300, at);
    tone.frequency.exponentialRampToValueAtTime(320, at + 0.25);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, 0.2 * velocity, 0.006, Math.max(length * 1.1, 0.5));
    const osc = oscillator(band, 'triangle', hz);
    const round = oscillator(band, 'sine', hz);
    osc.connect(tone);
    round.connect(tone);
    tone.connect(gain).connect(band.out);
    run([osc, round], at, end);
    // The finger on the string.
    hiss(band, at, [filter(ctx, 'bandpass', 700, 1)], 0.05 * velocity, 0.002, 0.04);
  },

  piano(band, { midi, velocity, length }, at) {
    const { ctx } = band;
    const hz = frequency(midi);
    const tone = filter(ctx, 'lowpass', 4000, 0.5);
    tone.frequency.setValueAtTime(Math.min(hz * 10, 7000), at);
    tone.frequency.exponentialRampToValueAtTime(Math.max(hz * 2.5, 700), at + 1.2);
    const gain = ctx.createGain();
    const hold = Math.max(length, 0.25);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.28 * velocity, at + 0.004);
    gain.gain.setTargetAtTime(0.1 * velocity, at + 0.006, 0.25);
    gain.gain.setTargetAtTime(0.0001, at + hold, 0.12);
    const end = at + hold + 0.6;
    const partials = [
      [1, 1, 0],
      [2, 0.45, 3],
      [3, 0.2, -2],
      [4.02, 0.1, 0],
    ] as const;
    const sources: OscillatorNode[] = [];
    for (const [ratio, level, detune] of partials) {
      const osc = oscillator(band, ratio === 1 ? 'triangle' : 'sine', hz * ratio, detune);
      const partialGain = ctx.createGain();
      partialGain.gain.value = level;
      osc.connect(partialGain).connect(tone);
      sources.push(osc);
    }
    tone.connect(gain).connect(band.out);
    run(sources, at, end);
    hiss(band, at, [filter(ctx, 'highpass', 2500)], 0.03 * velocity, 0.001, 0.02);
  },

  ride(band, { velocity }, at) {
    const { ctx } = band;
    // Metal: a few square waves at unrelated pitches, only their shimmer
    // let through, and a soft ping.
    const shimmer = filter(ctx, 'bandpass', 8200, 1.2);
    const air = filter(ctx, 'highpass', 5200);
    const gain = ctx.createGain();
    const end = decay(gain.gain, at, 0.25 * velocity, 0.002, 1.1);
    const sources = [263, 400, 421, 587].map((hz) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = hz * 1.7;
      osc.connect(shimmer);
      return osc;
    });
    shimmer.connect(air).connect(gain).connect(band.out);
    run(sources, at, end);
    const ping = ctx.createOscillator();
    ping.frequency.value = 5400;
    const pingGain = ctx.createGain();
    const pingEnd = decay(pingGain.gain, at, 0.05 * velocity, 0.002, 0.5);
    ping.connect(pingGain).connect(band.out);
    run([ping], at, pingEnd);
  },

  brush(band, { velocity, length }, at) {
    // A slow sweep across the snare head.
    hiss(
      band,
      at,
      [filter(band.ctx, 'bandpass', 2600, 0.6), filter(band.ctx, 'lowpass', 6000)],
      0.2 * velocity,
      Math.min(0.12, length / 3),
      length * 0.8,
    );
  },

  brushSlap(band, { velocity }, at) {
    hiss(
      band,
      at,
      [filter(band.ctx, 'bandpass', 2200, 0.9), filter(band.ctx, 'lowpass', 7000)],
      0.42 * velocity,
      0.003,
      0.16,
    );
  },

  chick(band, { velocity }, at) {
    hiss(
      band,
      at,
      [filter(band.ctx, 'highpass', 6000), filter(band.ctx, 'bandpass', 9000, 1)],
      0.45 * velocity,
      0.002,
      0.045,
    );
  },
};

/**
 * A room for the band to play in: a short, soft reverb made of decaying
 * noise (no impulse file). Returns the convolver; feed it a share of the mix.
 */
export function makeReverb(ctx: BaseAudioContext, seconds: number): ConvolverNode {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Dense and dark: louder early, fading away, a little less top end.
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.6 * (i < 80 ? i / 80 : 1);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}
