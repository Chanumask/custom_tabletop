import { describe, expect, it } from 'vitest';
import { SOUND_PRESETS, playSoundPreset } from './sounds.js';

describe('SOUND_PRESETS', () => {
  it('has at least one preset, each with a unique id', () => {
    expect(SOUND_PRESETS.length).toBeGreaterThan(0);
    const ids = SOUND_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('playSoundPreset', () => {
  it('is a silent no-op for an unknown preset id (never touches AudioContext)', () => {
    // AudioContext isn't available under Vitest's node environment, so this
    // only proves the early-return path for an unrecognized id — playback
    // itself is covered by the browser check (see docs/decisions.md).
    expect(() => playSoundPreset('not-a-real-preset')).not.toThrow();
  });
});
