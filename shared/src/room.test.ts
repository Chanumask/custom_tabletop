import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROOM_STATE,
  FIRE_BURN_MS,
  FIRE_STOKE_BOOST,
  fireLevel,
  normalizeRoomState,
  WINDOWS,
} from './room.js';

describe('the fire', () => {
  it('burns at its usual size until someone puts a log on', () => {
    expect(fireLevel(null, 1_000_000)).toBe(1);
  });

  it('flares up as the new log catches, then burns back down', () => {
    const stoked = 1_000_000;
    expect(fireLevel(stoked, stoked)).toBe(1);
    const caught = fireLevel(stoked, stoked + 2000);
    expect(caught).toBeGreaterThan(1.6);
    expect(caught).toBeLessThanOrEqual(1 + FIRE_STOKE_BOOST);
    const later = fireLevel(stoked, stoked + FIRE_BURN_MS / 2);
    expect(later).toBeLessThan(caught);
    expect(later).toBeGreaterThan(1);
    expect(fireLevel(stoked, stoked + FIRE_BURN_MS)).toBe(1);
    expect(fireLevel(stoked, stoked - 500)).toBe(1);
  });
});

describe('normalizeRoomState', () => {
  it('fills a room from before any of this in with the defaults', () => {
    expect(normalizeRoomState(undefined)).toEqual(DEFAULT_ROOM_STATE);
    expect(normalizeRoomState({ readingLampOn: false })).toEqual({
      ...DEFAULT_ROOM_STATE,
      readingLampOn: false,
    });
  });

  it('knows the weather and every window, and nothing else', () => {
    const saved = {
      weather: 'hail',
      windows: { north: { open: true, drawn: 'yes' }, attic: { open: true, drawn: true } },
    } as never;
    const room = normalizeRoomState(saved);
    expect(room.weather).toBe('clear');
    expect(Object.keys(room.windows)).toEqual([...WINDOWS]);
    expect(room.windows.north).toEqual({ open: true, drawn: false });
    expect(room.windows['west-2']).toEqual({ open: false, drawn: false });
    expect(normalizeRoomState({ weather: 'storm' }).weather).toBe('storm');
  });

  it('keeps a record that was playing, and drops a broken one', () => {
    expect(normalizeRoomState({ record: { record: 'lofi', startedAt: 12 } }).record).toEqual({
      record: 'lofi',
      startedAt: 12,
    });
    expect(normalizeRoomState({ record: { record: 'lofi' } as never }).record).toBeNull();
    expect(normalizeRoomState({}).record).toBeNull();
  });

  it('keeps only real candle groups, in their own order', () => {
    const saved = { candlesOut: ['oil-lamp', 'bogus', 'mantel-north'] } as never;
    expect(normalizeRoomState(saved).candlesOut).toEqual(['mantel-north', 'oil-lamp']);
  });
});
