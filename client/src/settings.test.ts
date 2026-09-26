import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  RESERVED_KEYS,
  loadSettings,
  saveSettings,
  type SettingsStorage,
} from './settings.js';
import { DEFAULT_SOUND_MIX } from './audioMix.js';

function fakeStorage(initial: Record<string, string> = {}): SettingsStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('loadSettings', () => {
  it('returns the defaults when nothing has been saved yet', () => {
    expect(loadSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips whatever was saved', () => {
    const storage = fakeStorage();
    const saved = {
      masterVolume: 0.4,
      interactKey: 'KeyF',
      sound: {
        ...DEFAULT_SOUND_MIX,
        fire: { on: false, volume: 1 },
        music: { on: true, volume: 0.3 },
      },
      mutedPlayers: ['bob'],
      noFlashing: true,
      menuCollapsed: true,
    };
    saveSettings(storage, saved);
    expect(loadSettings(storage)).toEqual(saved);
  });

  it('carries the old fireplace/night switches into the sound mix', () => {
    const storage = fakeStorage({
      'customTabletop.settings': JSON.stringify({ fireSound: false, nightSounds: true }),
    });
    const settings = loadSettings(storage);
    expect(settings.sound.fire).toEqual({ on: false, volume: 1 });
    expect(settings.sound.night).toEqual({ on: true, volume: 1 });
    expect(settings).not.toHaveProperty('fireSound');
    expect(settings).not.toHaveProperty('nightSounds');
  });

  it('keeps every sound on at full volume unless the player chose otherwise', () => {
    const storage = fakeStorage({
      'customTabletop.settings': JSON.stringify({
        sound: { tv: { on: false, volume: 0.5 }, footsteps: { volume: 7 }, bogus: {} },
        mutedPlayers: ['bob', 3, null],
        noFlashing: 'yes',
      }),
    });
    const settings = loadSettings(storage);
    expect(settings.sound.tv).toEqual({ on: false, volume: 0.5 });
    expect(settings.sound.footsteps).toEqual({ on: true, volume: 1 });
    expect(settings.sound.weather).toEqual({ on: true, volume: 1 });
    expect(settings.sound).not.toHaveProperty('bogus');
    expect(settings.mutedPlayers).toEqual(['bob']);
    expect(settings.noFlashing).toBe(false);
  });

  it('fills in defaults for fields missing from an older/partial saved shape', () => {
    const storage = fakeStorage({
      'customTabletop.settings': JSON.stringify({ masterVolume: 0.2 }),
    });
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 0.2 });
  });

  it('puts an interact key saved as a now-reserved key back to the default', () => {
    for (const key of RESERVED_KEYS.keys()) {
      const storage = fakeStorage({
        'customTabletop.settings': JSON.stringify({ interactKey: key, masterVolume: 0.3 }),
      });
      expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 0.3 });
    }
  });

  it('falls back to defaults for corrupt JSON instead of throwing', () => {
    const storage = fakeStorage({ 'customTabletop.settings': 'not json{' });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for a non-object saved value', () => {
    const storage = fakeStorage({ 'customTabletop.settings': '"just a string"' });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('does not throw if the underlying storage throws (e.g. private browsing)', () => {
    const throwingStorage: SettingsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled');
      },
    };
    expect(() => saveSettings(throwingStorage, DEFAULT_SETTINGS)).not.toThrow();
  });
});
