import { describe, expect, it } from 'vitest';
import { RECORDS } from '@custom-tabletop/shared';
import { eventsBetween, midi, seeded, songFor, swung } from './songs.js';
import type { SoundState } from '@custom-tabletop/shared';
import { loopPosition, playableSounds, soundOnRecord } from './MusicPlayer.js';

describe('the records', () => {
  it('plays exactly the same notes every time (so every player hears the same)', () => {
    for (const { id } of RECORDS) {
      const song = songFor(id);
      expect(eventsBetween(song, 30, 60)).toEqual(eventsBetween(songFor(id), 30, 60));
    }
  });

  it('hands out every note once, in order, however the time is cut up', () => {
    for (const { id } of RECORDS) {
      const song = songFor(id);
      const whole = eventsBetween(song, 0, 40);
      const pieces = [0, 3.3, 7.01, 12, 12.5, 25, 40];
      const cut = pieces.slice(1).flatMap((to, i) => eventsBetween(song, pieces[i]!, to));
      expect(cut).toEqual(whole);
      for (let i = 1; i < whole.length; i++)
        expect(whole[i]!.at).toBeGreaterThanOrEqual(whole[i - 1]!.at);
    }
  });

  it('keeps every instrument in a sensible range, and every note playable', () => {
    for (const { id } of RECORDS) {
      const song = songFor(id);
      // Far into the record too: it goes on for as long as it's left on.
      for (const from of [0, 600, 36_000]) {
        for (const event of eventsBetween(song, from, from + 90)) {
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThanOrEqual(1);
          expect(event.length).toBeGreaterThan(0);
          if (
            [
              'bodhran',
              'tambourine',
              'kick',
              'snare',
              'hat',
              'openHat',
              'ride',
              'brush',
              'brushSlap',
              'chick',
            ].includes(event.instrument)
          )
            continue;
          expect(event.midi).toBeGreaterThanOrEqual(midi('E1'));
          expect(event.midi).toBeLessThanOrEqual(midi('D7'));
        }
      }
    }
  });

  it('has a tune that comes round again: the jig plays its phrases twice', () => {
    const song = songFor('tavern');
    const tune = (bar: number) =>
      song
        .bar(bar)
        .filter((event) => event.instrument === 'fiddle')
        .map(({ at, midi: note }) => [at.toFixed(3), note]);
    // The A part's second phrase opens like its first (same chords, same
    // notes)…
    expect(tune(8).length).toBeGreaterThan(0);
    expect(tune(12)).toEqual(tune(8));
    expect(tune(13)).toEqual(tune(9));
    // …and the second time through the part is the same as the first.
    expect(tune(10)).toEqual(tune(2));
    // It ends the part at home, on a D.
    const last = song
      .bar(15)
      .filter((event) => event.instrument === 'fiddle')
      .at(-1)!;
    expect(last.midi % 12).toBe(2);
  });

  it('starts quietly: a count-in before the tune, a bar of keys before the drums', () => {
    expect(
      songFor('tavern')
        .bar(0)
        .some((event) => event.instrument === 'fiddle'),
    ).toBe(false);
    expect(
      songFor('lofi')
        .bar(0)
        .some((event) => event.instrument === 'kick'),
    ).toBe(false);
    expect(
      songFor('lofi')
        .bar(1)
        .some((event) => event.instrument === 'kick'),
    ).toBe(true);
  });

  it('walks the jazz bass a note a beat, into the next chord', () => {
    const song = songFor('rain-jazz');
    for (let bar = 0; bar < 16; bar++) {
      const bass = song.bar(bar).filter((event) => event.instrument === 'upright');
      expect(bass).toHaveLength(4);
      const next = song.bar(bar + 1).find((event) => event.instrument === 'upright')!;
      // The fourth note leans a half step into the next bar's first.
      expect(Math.abs(bass[3]!.midi - next.midi)).toBeLessThanOrEqual(1);
    }
  });
});

describe('music helpers', () => {
  it('names notes', () => {
    expect(midi('C4')).toBe(60);
    expect(midi('A4')).toBe(69);
    expect(midi('F#4')).toBe(66);
    expect(midi('Bb1')).toBe(34);
  });

  it('swings the offbeats late and keeps the downbeats', () => {
    expect(swung(2, 0.66)).toBe(2);
    expect(swung(2.5, 0.66)).toBeCloseTo(2.66);
    expect(swung(2.25, 0.66)).toBeCloseTo(2.33);
    expect(swung(2.75, 0.66)).toBeCloseTo(2.83);
  });

  it('draws the same random numbers from the same seed', () => {
    const a = seeded(1, 2, 3);
    const b = seeded(1, 2, 3);
    const c = seeded(1, 2, 4);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('finds a soundboard sound on the record player, and where a loop is', () => {
    expect(soundOnRecord('sound:abc')).toBe('abc');
    expect(soundOnRecord('lofi')).toBeNull();
    expect(loopPosition(130, 60)).toBeCloseTo(10);
    expect(loopPosition(-5, 60)).toBeCloseTo(55);
    expect(loopPosition(10, 0)).toBe(0);
  });
});

describe('the record box', () => {
  const sound = (id: string, url: string): SoundState => ({
    id,
    name: id,
    url,
    playing: false,
    addedBy: null,
  });

  it('offers the soundboard’s audio files — not its effects or YouTube links', () => {
    const soundboard = [
      sound('bell', ''),
      sound('theme', 'http://localhost/uploads/sounds/theme.mp3'),
      sound('video', 'https://youtu.be/dQw4w9WgXcQ'),
      sound('rain', 'https://example.com/rain.ogg'),
    ];
    expect(playableSounds(soundboard).map((item) => item.id)).toEqual(['theme', 'rain']);
  });
});
