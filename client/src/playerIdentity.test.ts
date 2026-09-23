import { describe, expect, it } from 'vitest';
import { getOrCreatePlayerId, type IdStorage } from './playerIdentity.js';

function fakeStorage(): IdStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('getOrCreatePlayerId', () => {
  it('creates and persists an id on first call, reusing it afterward', () => {
    const storage = fakeStorage();
    const id = getOrCreatePlayerId(storage);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getOrCreatePlayerId(storage)).toBe(id);
  });

  it('generates independent ids for independent storages (simulating two tabs)', () => {
    const idA = getOrCreatePlayerId(fakeStorage());
    const idB = getOrCreatePlayerId(fakeStorage());
    expect(idA).not.toBe(idB);
  });
});
