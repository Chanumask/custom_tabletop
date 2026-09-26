import type { RecordId } from '@custom-tabletop/shared';

/**
 * The record player's three records, composed as they play (docs/decisions.md,
 * "The cozy room, lived in"): each is a tune with a form — chords, a bass, drums, a
 * melody — worked out bar by bar from nothing but the bar's number, so every
 * player's browser plays the very same notes at the very same time (the
 * record's start is shared, GameState.room.record). Pure: this only says
 * what to play and when; instruments.ts makes the sounds.
 */

export type Instrument =
  // Tavern Night
  | 'lute'
  | 'fiddle'
  | 'whistle'
  | 'folkBass'
  | 'bodhran'
  | 'tambourine'
  // Lo-fi Evening
  | 'rhodes'
  | 'subBass'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'openHat'
  | 'keys'
  // Rain Jazz
  | 'upright'
  | 'piano'
  | 'ride'
  | 'brush'
  | 'brushSlap'
  | 'chick';

export interface NoteEvent {
  /** Seconds from the start of the record (from the bar's start in `bar`). */
  at: number;
  instrument: Instrument;
  /** MIDI note number (60 = middle C); drums ignore it. */
  midi: number;
  /** Seconds. */
  length: number;
  /** 0..1 */
  velocity: number;
}

export interface Song {
  id: RecordId;
  barSeconds: number;
  /** Everything in bar `index` (0 = the first), timed from the bar's start. */
  bar(index: number): NoteEvent[];
}

/** Every note starting in [from, to) seconds, in time order. */
export function eventsBetween(song: Song, from: number, to: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  if (to <= from) return events;
  const first = Math.max(0, Math.floor(from / song.barSeconds));
  const last = Math.floor(to / song.barSeconds);
  for (let index = first; index <= last; index++) {
    const start = index * song.barSeconds;
    for (const event of song.bar(index)) {
      const at = start + event.at;
      if (at >= from && at < to) events.push({ ...event, at });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

export function songFor(id: RecordId): Song {
  switch (id) {
    case 'tavern':
      return TAVERN;
    case 'lofi':
      return LOFI;
    case 'rain-jazz':
      return RAIN_JAZZ;
  }
}

// ---------------------------------------------------------------------------
// Little helpers

/** A seeded random number generator (mulberry32): the same seed, the same
 * numbers, on every machine. */
export function seeded(...parts: number[]): () => number {
  let seed = 0x9e3779b9;
  for (const part of parts) seed = Math.imul(seed ^ (part | 0), 0x85ebca6b) ^ (seed >>> 13);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

const NOTE_NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "F#4" → 66, "Bb2" → 46. */
export function midi(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`not a note: ${name}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return 12 * (Number(match[3]) + 1) + NOTE_NAMES[match[1]!]! + accidental;
}

const notes = (names: string) => names.split(' ').map(midi);

/** The scale tone nearest `from` in `scale` (pitch classes), stepping
 * `steps` scale degrees up (+) or down (-). */
function stepInScale(from: number, steps: number, scale: readonly number[]): number {
  let note = from;
  let left = Math.abs(steps);
  const direction = Math.sign(steps);
  while (left > 0) {
    note += direction;
    if (scale.includes(((note % 12) + 12) % 12)) left -= 1;
  }
  return note;
}

/** The note of `pitchClasses` nearest to `near` (ties go up). */
function nearestOf(pitchClasses: readonly number[], near: number): number {
  let best = near;
  let bestDistance = Infinity;
  for (let note = near - 7; note <= near + 7; note++) {
    if (!pitchClasses.includes(((note % 12) + 12) % 12)) continue;
    const distance = Math.abs(note - near);
    if (distance < bestDistance) {
      best = note;
      bestDistance = distance;
    }
  }
  return best;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// ---------------------------------------------------------------------------
// Tavern Night — a jig in D, 6/8: a lute picking the chords, a folk bass, a
// frame drum and a tambourine, and a fiddle (a tin whistle on alternate
// times round) playing a tune in two parts, each played twice: AABB.

const TAVERN_EIGHTH = 60 / 216;
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];

interface FolkChord {
  root: number;
  tones: number[];
}
const chord = (root: string, tones: string): FolkChord => ({
  root: midi(root),
  tones: tones.split(' ').map((name) => midi(`${name}0`) % 12),
});
const D = chord('D2', 'D F# A');
const G = chord('G2', 'G B D');
const A = chord('A2', 'A C# E');
const Bm = chord('B1', 'B D F#');
const Em = chord('E2', 'E G B');

/** Each bar's chord (two for a bar that changes halfway). */
const TAVERN_CHORDS: FolkChord[][] = [
  // A part
  [D],
  [D],
  [G],
  [A],
  [D],
  [D],
  [G, A],
  [D],
  // B part
  [Bm],
  [Bm],
  [G],
  [D],
  [Em],
  [G],
  [A],
  [D],
];

const JIG_RHYTHMS = [
  [1, 1, 1, 1, 1, 1],
  [2, 1, 2, 1],
  [2, 1, 1, 1, 1],
  [1, 1, 1, 2, 1],
  [3, 1, 1, 1],
];
const JIG_ENDINGS = [
  [2, 1, 3],
  [1, 1, 1, 3],
];

/** One bar of the tune: part (0 = A, 1 = B), bar within the part. The
 * parts' two halves share their first three bars, so the tune repeats the
 * way a folk tune does; the fourth bar ends open, the eighth comes home. */
function jigBar(
  part: number,
  barInPart: number,
  chords: FolkChord[],
): { eighth: number; length: number; midi: number }[] {
  const phraseBar = barInPart % 4;
  const closing = barInPart === 7;
  const cadence = phraseBar === 3;
  // Bars 4–6 play bars 0–2 again.
  const random = seeded(0x7a3e, part, cadence ? barInPart : phraseBar);
  const rhythm = cadence ? pick(random, JIG_ENDINGS) : pick(random, JIG_RHYTHMS);
  // Where the phrase starts, and the previous bar's last note (worked out
  // again from its own seed so each bar stands alone).
  let note = phraseStart(part, phraseBar);
  const out: { eighth: number; length: number; midi: number }[] = [];
  let eighth = 0;
  rhythm.forEach((length, i) => {
    const last = i === rhythm.length - 1;
    const current = chords[eighth >= 3 && chords.length > 1 ? 1 : 0]!;
    if (cadence && last) {
      // Home to D at the end of the tune; to A (open) halfway.
      note = nearestOf(closing ? [2] : [9], note);
    } else if (eighth === 0 || eighth === 3) {
      // Strong beats land on the chord.
      const leap = random() < 0.25 ? pick(random, [-4, 4]) : 0;
      note = nearestOf(current.tones, note + leap);
    } else {
      // Between them, step along the scale, turning back at the edges.
      let step = random() < 0.5 ? 1 : -1;
      if (note > midi('B5')) step = -1;
      if (note < midi('A4')) step = 1;
      note = stepInScale(note, step, D_MAJOR);
    }
    note = clamp(note, midi('A4'), midi('D6'));
    out.push({ eighth, length, midi: note });
    eighth += length;
  });
  return out;
}

/** Where each bar of a phrase picks up (so each bar's walk is its own). */
function phraseStart(part: number, phraseBar: number): number {
  const random = seeded(0x51a7, part, phraseBar);
  return part === 0 ? pick(random, notes('F#5 A5 D5 E5')) : pick(random, notes('B5 A5 F#5 D5'));
}

const TAVERN: Song = {
  id: 'tavern',
  barSeconds: 6 * TAVERN_EIGHTH,
  bar(index) {
    const e = TAVERN_EIGHTH;
    const inForm = index % 32;
    const time = Math.floor(index / 32);
    const part = inForm < 16 ? 0 : 1;
    const barInPart = inForm % 8;
    const chords = TAVERN_CHORDS[part * 8 + barInPart]!;
    const random = seeded(0x7ab, index);
    const events: NoteEvent[] = [];
    const add = (
      eighth: number,
      instrument: Instrument,
      note: number,
      length: number,
      velocity: number,
    ) => events.push({ at: eighth * e, instrument, midi: note, length: length * e, velocity });

    // The lute: up through the chord and back, each half bar.
    for (let half = 0; half < 2; half++) {
      const current = chords[half && chords.length > 1 ? 1 : 0]!;
      const tones = current.tones;
      const low = nearestOf([current.root % 12], midi('D3'));
      const pattern = [low, nearestOf(tones, low + 7), nearestOf(tones, low + 12)];
      pattern.forEach((note, i) =>
        add(half * 3 + i, 'lute', note, 2.2, i === 0 ? 0.62 : 0.42 + random() * 0.08),
      );
    }
    // The bass: the root, and the fifth halfway.
    const first = chords[0]!;
    const second = chords[chords.length - 1]!;
    add(0, 'folkBass', first.root, 2.6, 0.7);
    add(3, 'folkBass', chords.length > 1 ? second.root : first.root + 7, 2.6, 0.55);
    // The frame drum: the lilt of the jig, with a little fill now and then.
    add(0, 'bodhran', 0, 1, 0.9);
    add(3, 'bodhran', 0, 1, 0.65);
    add(2, 'bodhran', 1, 1, 0.28);
    add(5, 'bodhran', 1, 1, 0.3);
    if (barInPart === 7 || random() < 0.2) add(4, 'bodhran', 1, 1, 0.25);
    // The tambourine on the second beat (and both, in the B part).
    add(3, 'tambourine', 0, 1, 0.3);
    if (part === 1) add(0, 'tambourine', 0, 1, 0.2);
    // The tune: the fiddle, and every other time round, a tin whistle (the
    // very first bars stay just the band, a count-in).
    if (index >= 2) {
      const voice: Instrument = time % 2 === 0 ? 'fiddle' : 'whistle';
      for (const note of jigBar(part, barInPart, chords)) {
        add(note.eighth, voice, note.midi, note.length * 0.95, note.eighth % 3 === 0 ? 0.75 : 0.58);
      }
    }
    return events;
  },
};

// ---------------------------------------------------------------------------
// Lo-fi Evening — 72 bpm, swung: soft electric-piano chords going down the
// scale, a round bass, a lazy kick-and-snare with hats, and now and then a
// few notes of a tune on top.

const LOFI_BEAT = 60 / 72;
const LOFI_SWING = 0.58;

const LOFI_CHORDS = [
  { bass: 'F2', voicing: 'A3 C4 E4 G4' }, // Fmaj9
  { bass: 'E2', voicing: 'G3 B3 D4 F#4' }, // Em9
  { bass: 'D2', voicing: 'F3 A3 C4 E4' }, // Dm9
  { bass: 'C2', voicing: 'E3 G3 B3 D4' }, // Cmaj9
  { bass: 'Bb1', voicing: 'D4 F4 A4 C5' }, // Bbmaj9
  { bass: 'A1', voicing: 'G3 B3 C4 E4' }, // Am9
  { bass: 'G1', voicing: 'F3 A3 Bb3 D4' }, // Gm9
  { bass: 'C2', voicing: 'Bb3 D4 F4 G4' }, // C9sus
].map(({ bass, voicing }) => ({ bass: midi(bass), voicing: notes(voicing) }));

const C_PENTATONIC = notes('C5 D5 E5 G5 A5 C6');

/** A beat position, swung: the second eighth of each beat comes late (at
 * `swing` of the way through the beat, not half), and the sixteenths in
 * between stretch and squeeze to match. */
export function swung(beat: number, swing: number): number {
  const whole = Math.floor(beat);
  const within = beat - whole;
  return (
    whole + (within < 0.5 ? within * (swing / 0.5) : swing + (within - 0.5) * ((1 - swing) / 0.5))
  );
}

const LOFI: Song = {
  id: 'lofi',
  barSeconds: 4 * LOFI_BEAT,
  bar(index) {
    const b = LOFI_BEAT;
    const inCycle = index % 16;
    const current = LOFI_CHORDS[index % 8]!;
    const random = seeded(0x10f1, index);
    const events: NoteEvent[] = [];
    const add = (
      beat: number,
      instrument: Instrument,
      note: number,
      length: number,
      velocity: number,
    ) =>
      events.push({
        at: swung(beat, LOFI_SWING) * b,
        instrument,
        midi: note,
        length: length * b,
        velocity,
      });

    // Keys: the chord, pushed and laid back.
    const comp = pick(random, [
      [
        [0, 1.9],
        [2.5, 1.4],
      ],
      [
        [0, 1.4],
        [1.5, 0.9],
        [3, 0.9],
      ],
      [[0, 3.6]],
      [
        [0.5, 1.8],
        [2.5, 1.4],
      ],
    ]);
    for (const [beat, length] of comp) {
      current.voicing.forEach((note, i) =>
        // A tiny strum, low to high.
        events.push({
          at: (swung(beat!, LOFI_SWING) + i * 0.02) * b,
          instrument: 'rhodes',
          midi: note,
          length: length! * b,
          velocity: 0.42 + random() * 0.06,
        }),
      );
    }
    // Bass: the root, then the root or the fifth on the and-of-three.
    add(0, 'subBass', current.bass, 1.6, 0.8);
    add(2.5, 'subBass', current.bass + (random() < 0.4 ? 7 : random() < 0.5 ? 12 : 0), 1.2, 0.65);
    // Drums, after a bar of just keys at the very start.
    if (index > 0) {
      add(0, 'kick', 0, 0.5, 0.85);
      add(1.5, 'kick', 0, 0.5, 0.6);
      if (random() < 0.35) add(2.75, 'kick', 0, 0.5, 0.45);
      add(1, 'snare', 0, 0.5, 0.62);
      add(3, 'snare', 0, 0.5, 0.66);
      for (let eighth = 0; eighth < 8; eighth++) {
        const beat = eighth / 2;
        const open = eighth === 7 && inCycle % 4 === 3;
        add(
          beat,
          open ? 'openHat' : 'hat',
          0,
          open ? 0.6 : 0.1,
          (eighth % 2 === 0 ? 0.36 : 0.22) + random() * 0.06,
        );
      }
    }
    // A few notes of a tune in the second half of each sixteen bars.
    if (inCycle >= 8 && inCycle < 14) {
      const tune = seeded(0x3e1, inCycle, Math.floor(index / 32) % 2);
      let note = pick(tune, C_PENTATONIC);
      const beats = pick(tune, [
        [0, 1.5, 3],
        [0.5, 2],
        [0, 1, 2.5],
        [1.5, 2.5, 3.5],
      ]);
      beats.forEach((beat, i) => {
        const index2 = C_PENTATONIC.indexOf(note) + pick(tune, [-1, 1, 1, 2, -2]);
        note = C_PENTATONIC[clamp(index2, 0, C_PENTATONIC.length - 1)]!;
        const length = i === beats.length - 1 ? 1.6 : 0.9;
        add(beat, 'keys', note, length, 0.4);
      });
    }
    return events;
  },
};

// ---------------------------------------------------------------------------
// Rain Jazz — a slow swing in B-flat: a walking bass, brushes and the ride,
// piano chords comping behind, and a little piano melody coming and going.

const JAZZ_BEAT = 60 / 84;
const JAZZ_SWING = 0.66;

interface JazzChord {
  root: number;
  tones: number[];
  voicing: number[];
}
const jazz = (root: string, tones: string, voicing: string): JazzChord => ({
  root: midi(root),
  tones: tones.split(' ').map((name) => midi(`${name}0`) % 12),
  voicing: notes(voicing),
});

const JAZZ_CHORDS: JazzChord[] = [
  jazz('C2', 'C Eb G Bb', 'Eb3 G3 Bb3 D4'), // Cm9
  jazz('F2', 'F A C Eb', 'Eb3 G3 A3 D4'), // F13
  jazz('Bb1', 'Bb D F A', 'D3 F3 A3 C4'), // Bbmaj9
  jazz('Eb2', 'Eb G Bb D', 'D3 G3 Bb3 F4'), // Ebmaj9
  jazz('A1', 'A C Eb G', 'Eb3 G3 A3 C4'), // Am7b5
  jazz('D2', 'D F# A C', 'C3 F#3 Bb3 Eb4'), // D7b9
  jazz('G1', 'G Bb D F', 'F3 A3 Bb3 D4'), // Gm9
  jazz('G1', 'G Bb D F', 'Bb2 D3 F3 A3'), // Gm9
  jazz('C2', 'C Eb G Bb', 'Eb3 G3 Bb3 D4'), // Cm9
  jazz('F2', 'F A C Eb', 'Eb3 A3 C4 D4'), // F13
  jazz('D2', 'D F A C', 'F3 A3 C4 E4'), // Dm9
  jazz('G1', 'G B D F', 'F3 B3 E4 Ab4'), // G7alt
  jazz('C2', 'C Eb G Bb', 'Eb3 G3 Bb3 D4'), // Cm9
  jazz('F2', 'F A C Eb', 'Eb3 G3 A3 D4'), // F13
  jazz('Bb1', 'Bb D F A', 'D3 F3 A3 C4'), // Bbmaj9
  jazz('F2', 'F A C Eb', 'Eb3 A3 C4 F4'), // F7 — back to the top
];

/** Where the bass starts bar `index`: its chord's root, low or a fourth
 * up — worked out the same by the bar before, which walks into it. */
function jazzRoot(index: number): number {
  const chord = JAZZ_CHORDS[index % 16]!;
  const high = seeded(0x1a23, index)() < 0.5;
  return clamp(nearestOf([chord.root % 12], midi('C2') + (high ? 5 : 0)), midi('E1'), midi('D3'));
}

const BB_BLUES = notes('Bb3 Db4 Eb4 E4 F4 Ab4 Bb4 Db5 Eb5 E5 F5').map((note) => note % 12);

const RAIN_JAZZ: Song = {
  id: 'rain-jazz',
  barSeconds: 4 * JAZZ_BEAT,
  bar(index) {
    const b = JAZZ_BEAT;
    const inForm = index % 16;
    const chorus = Math.floor(index / 16);
    const current = JAZZ_CHORDS[inForm]!;
    const random = seeded(0x1a22, index);
    const events: NoteEvent[] = [];
    const add = (
      beat: number,
      instrument: Instrument,
      note: number,
      length: number,
      velocity: number,
    ) =>
      events.push({
        at: swung(beat, JAZZ_SWING) * b,
        instrument,
        midi: note,
        length: length * b,
        velocity,
      });

    // The walking bass: the root, two notes of the chord or scale, then a
    // half step into the next bar's root.
    const root = jazzRoot(index);
    const target = jazzRoot(index + 1);
    const second = nearestOf(current.tones, root + pick(random, [3, 4, 7]));
    const third = nearestOf(current.tones, second + pick(random, [-3, 3, 4, -4]));
    const approach = target + (random() < 0.5 ? 1 : -1);
    [root, second, third, approach].forEach((note, beat) =>
      add(beat, 'upright', clamp(note, midi('E1'), midi('D3')), 0.92, beat % 2 === 0 ? 0.78 : 0.66),
    );
    // Drums: the ride's swing, brushes sweeping, the hi-hat's foot on two
    // and four. A bar of just bass and brushes to begin.
    for (const [beat, velocity] of [
      [0, 0.38],
      [1, 0.32],
      [1.5, 0.22],
      [2, 0.38],
      [3, 0.32],
      [3.5, 0.22],
    ] as const) {
      if (index > 0) add(beat, 'ride', 0, 1.5, velocity + random() * 0.05);
    }
    for (let beat = 0; beat < 4; beat++) add(beat, 'brush', 0, 0.9, 0.3);
    add(1, 'brushSlap', 0, 0.3, 0.32);
    add(3, 'brushSlap', 0, 0.3, 0.36);
    add(1, 'chick', 0, 0.1, 0.28);
    add(3, 'chick', 0, 0.1, 0.28);
    // Piano chords, comping.
    if (index > 0) {
      const comp = pick(random, [
        [[0, 1.2]],
        [
          [0, 0.8],
          [1.5, 0.9],
        ],
        [[1.5, 1.4]],
        [
          [0, 1],
          [3.5, 0.9],
        ],
        [[2, 1.5]],
      ]);
      for (const [beat, length] of comp) {
        current.voicing.forEach((note) =>
          add(beat!, 'piano', note, length!, 0.34 + random() * 0.06),
        );
      }
    }
    // The melody: a phrase every other pair of bars, on alternate choruses
    // answering itself an octave apart.
    const phrase = Math.floor(inForm / 2);
    if (phrase % 2 === 1 && index >= 16) {
      const tune = seeded(0x2f7, inForm, chorus % 3);
      let note = nearestOf(current.tones, chorus % 2 === 0 ? midi('F4') : midi('Bb4'));
      const beats = pick(tune, [
        [0, 0.5, 1, 2.5],
        [0.5, 1.5, 2, 3],
        [0, 1.5, 2.5],
        [0, 0.5, 1.5, 2, 2.5, 3.5],
      ]);
      beats.forEach((beat, i) => {
        const lastNote = i === beats.length - 1;
        note = lastNote
          ? nearestOf(current.tones, note)
          : nearestOf(BB_BLUES, note + pick(tune, [-3, -2, -1, 1, 2, 3]));
        note = clamp(note, midi('D4'), midi('F5'));
        add(beat, 'piano', note + 12, lastNote ? 1.4 : 0.5, 0.5 + tune() * 0.1);
      });
    }
    return events;
  },
};
