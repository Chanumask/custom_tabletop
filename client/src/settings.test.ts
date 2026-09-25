import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type SettingsStorage } from './settings.js';

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
    saveSettings(storage, {
      masterVolume: 0.4,
      interactKey: 'KeyF',
      fireSound: false,
      nightSounds: false,
      menuCollapsed: true,
    });
    expect(loadSettings(storage)).toEqual({
      masterVolume: 0.4,
      interactKey: 'KeyF',
      fireSound: false,
      nightSounds: false,
      menuCollapsed: true,
    });
  });

  it('fills in defaults for fields missing from an older/partial saved shape', () => {
    const storage = fakeStorage({
      'customTabletop.settings': JSON.stringify({ masterVolume: 0.2 }),
    });
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 0.2 });
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
