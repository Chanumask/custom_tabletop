import { describe, expect, it } from 'vitest';
import {
  categoryVolume,
  DEFAULT_SOUND_MIX,
  flashingAllowed,
  isPlayerMuted,
  mixedVolume,
  setAudioPreferences,
  SOUND_CATEGORIES,
  type AudioPreferences,
} from './audioMix.js';

const preferences = (overrides: Partial<AudioPreferences> = {}): AudioPreferences => ({
  masterVolume: 1,
  sound: DEFAULT_SOUND_MIX,
  mutedPlayers: [],
  noFlashing: false,
  ...overrides,
});

describe('the sound mix', () => {
  it('starts with every kind of sound on, at full volume', () => {
    for (const { id } of SOUND_CATEGORIES) {
      expect(mixedVolume(preferences(), id)).toBe(1);
    }
  });

  it('is the master volume times the category’s own, and silent when switched off', () => {
    const mix = {
      ...DEFAULT_SOUND_MIX,
      music: { on: true, volume: 0.5 },
      fire: { on: false, volume: 1 },
    };
    expect(mixedVolume(preferences({ masterVolume: 0.8, sound: mix }), 'music')).toBeCloseTo(0.4);
    expect(mixedVolume(preferences({ sound: mix }), 'fire')).toBe(0);
    expect(mixedVolume(preferences({ masterVolume: 0 }), 'table')).toBe(0);
  });

  it('never goes past full or below silent', () => {
    const mix = { ...DEFAULT_SOUND_MIX, tv: { on: true, volume: 3 } };
    expect(mixedVolume(preferences({ masterVolume: 5, sound: mix }), 'tv')).toBe(1);
    expect(mixedVolume(preferences({ masterVolume: -1 }), 'tv')).toBe(0);
  });

  it('follows the player’s settings: volumes, silenced players, flashing', () => {
    setAudioPreferences(
      preferences({
        masterVolume: 0.5,
        mutedPlayers: ['bob'],
        noFlashing: true,
      }),
    );
    expect(categoryVolume('soundboard')).toBe(0.5);
    expect(isPlayerMuted('bob')).toBe(true);
    expect(isPlayerMuted('carol')).toBe(false);
    expect(isPlayerMuted(null)).toBe(false);
    expect(flashingAllowed()).toBe(false);
    setAudioPreferences(preferences());
    expect(flashingAllowed()).toBe(true);
  });
});
