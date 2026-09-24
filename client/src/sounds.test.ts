import { describe, expect, it } from 'vitest';
import { playSound } from './sounds.js';

describe('playSound', () => {
  it('resolves as a silent no-op for an unrecognized built-in preset id (never touches AudioContext)', async () => {
    // AudioContext/Audio aren't available under Vitest's node environment,
    // so this only proves the early-return path for an id with no matching
    // tone params. Actual tone synthesis and file playback are covered by
    // the browser check instead (see docs/decisions.md, Milestone 8).
    await expect(
      playSound({ id: 'not-a-real-preset', name: 'Nope', url: '', playing: false, addedBy: null }),
    ).resolves.toBeUndefined();
  });
});
