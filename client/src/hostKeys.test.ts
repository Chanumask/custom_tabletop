import { describe, expect, it } from 'vitest';
import { hostLink, loadHostKey, saveHostKey } from './hostKeys.js';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('host keys', () => {
  it('remembers a key per table', () => {
    const storage = fakeStorage();
    saveHostKey(storage, 'CRYPT', 'key-1');
    saveHostKey(storage, 'KEEP', 'key-2');
    expect(loadHostKey(storage, 'CRYPT')).toBe('key-1');
    expect(loadHostKey(storage, 'KEEP')).toBe('key-2');
    expect(loadHostKey(storage, 'OTHER')).toBeNull();
  });

  it('replaces a table’s key and forgets the oldest past 30 tables', () => {
    const storage = fakeStorage();
    for (let i = 0; i < 32; i++) saveHostKey(storage, `T${i}`, `k${i}`, i);
    expect(loadHostKey(storage, 'T0')).toBeNull();
    expect(loadHostKey(storage, 'T1')).toBeNull();
    expect(loadHostKey(storage, 'T31')).toBe('k31');
    saveHostKey(storage, 'T31', 'new', 100);
    expect(loadHostKey(storage, 'T31')).toBe('new');
  });

  it('survives corrupt or blocked storage', () => {
    expect(loadHostKey(fakeStorage({ 'customTabletop.hostKeys': '{nope' }), 'X')).toBeNull();
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveHostKey(blocked, 'X', 'k')).not.toThrow();
  });

  it('builds a host link that reopens the table', () => {
    expect(hostLink('https://tabletop.murri.me/', 'CRYPT', 'abc_-123')).toBe(
      'https://tabletop.murri.me/?join=CRYPT&host=abc_-123',
    );
  });
});
