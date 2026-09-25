import { describe, expect, it } from 'vitest';
import { isSeekJump, needsResync } from './clipSync.js';

describe('isSeekJump', () => {
  const at = 1_000_000;

  it('ignores normal playback and a paused player', () => {
    expect(isSeekJump({ position: 10, at }, { position: 11, at: at + 1000 }, true)).toBe(false);
    expect(isSeekJump({ position: 10, at }, { position: 10, at: at + 1000 }, false)).toBe(false);
  });

  it('ignores buffering — the position stands still, it never jumps', () => {
    expect(isSeekJump({ position: 10, at }, { position: 10, at: at + 1000 }, true)).toBe(false);
  });

  it('spots a seek forward or back, playing or paused', () => {
    expect(isSeekJump({ position: 10, at }, { position: 95, at: at + 1000 }, true)).toBe(true);
    expect(isSeekJump({ position: 95, at }, { position: 12, at: at + 1000 }, true)).toBe(true);
    expect(isSeekJump({ position: 40, at }, { position: 70, at: at + 1000 }, false)).toBe(true);
  });
});

describe('needsResync', () => {
  it('lets small differences be, catches real drift', () => {
    expect(needsResync(10, 10.8)).toBe(false);
    expect(needsResync(10, 12)).toBe(true);
    expect(needsResync(40, 30)).toBe(true);
  });
});
