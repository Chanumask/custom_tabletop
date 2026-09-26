import { describe, expect, it } from 'vitest';
import {
  loadDeviceCopy,
  loadKeepCopy,
  markShared,
  saveDeviceCopy,
  saveKeepCopy,
  wantsShared,
} from './profileMemory.js';
import { describeFailure } from './profileImages.js';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('storage is off');
  },
  setItem: () => {
    throw new Error('storage is off');
  },
};

describe('keeping a copy on this device', () => {
  it('is on until the player turns it off, and stays as they left it', () => {
    const storage = memoryStorage();
    expect(loadKeepCopy(storage)).toBe(true);
    saveKeepCopy(storage, false);
    expect(loadKeepCopy(storage)).toBe(false);
    saveKeepCopy(storage, true);
    expect(loadKeepCopy(storage)).toBe(true);
  });

  it('survives a browser that won’t store anything', async () => {
    expect(loadKeepCopy(brokenStorage)).toBe(true);
    expect(() => saveKeepCopy(brokenStorage, false)).not.toThrow();
    // No IndexedDB here at all (as in some private windows).
    expect(await loadDeviceCopy()).toBeNull();
    expect(await saveDeviceCopy(new Blob(['x']))).toBe(false);
  });
});

describe('wanting it shared at a table', () => {
  it('is per table, and withdrawn by marking none', () => {
    const storage = memoryStorage();
    expect(wantsShared(storage, 'ABCDE')).toBe(false);
    markShared(storage, 'ABCDE');
    expect(wantsShared(storage, 'ABCDE')).toBe(true);
    expect(wantsShared(storage, 'OTHER')).toBe(false);
    markShared(storage, null);
    expect(wantsShared(storage, 'ABCDE')).toBe(false);
  });

  it('is simply false in a browser that won’t store anything', () => {
    expect(wantsShared(brokenStorage, 'ABCDE')).toBe(false);
    expect(() => markShared(brokenStorage, 'ABCDE')).not.toThrow();
  });
});

describe('what a failed request says', () => {
  it('passes on the server’s own words', () => {
    expect(describeFailure(403, { error: 'Only the host can see other players’ profiles.' })).toBe(
      'Only the host can see other players’ profiles.',
    );
  });

  it('explains a failure that came without any', () => {
    expect(describeFailure(413, null)).toContain('10 MB');
    expect(describeFailure(429, 'not json')).toContain('Too many');
    expect(describeFailure(0, null)).toContain('connection');
    expect(describeFailure(502, null)).toContain('try again');
    expect(describeFailure(418, {})).toContain('418');
  });
});
