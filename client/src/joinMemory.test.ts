import { describe, expect, it } from 'vitest';
import {
  clearLastJoin,
  loadLastJoin,
  loadRememberedColor,
  loadRememberedName,
  rememberColor,
  rememberName,
  saveLastJoin,
} from './joinMemory.js';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('joinMemory', () => {
  it('round-trips the last join intent and clears it', () => {
    const storage = fakeStorage();
    expect(loadLastJoin(storage)).toBeNull();

    saveLastJoin(storage, { playerName: 'Alice', sessionId: 'ABCDE' });
    expect(loadLastJoin(storage)).toEqual({ playerName: 'Alice', sessionId: 'ABCDE' });

    clearLastJoin(storage);
    expect(loadLastJoin(storage)).toBeNull();
  });

  it('treats corrupt or wrongly-shaped stored data as nothing stored', () => {
    const storage = fakeStorage();
    storage.setItem('customTabletop.lastJoin', '{not json');
    expect(loadLastJoin(storage)).toBeNull();
    storage.setItem('customTabletop.lastJoin', JSON.stringify({ sessionId: 42 }));
    expect(loadLastJoin(storage)).toBeNull();
  });

  it('remembers the player name', () => {
    const storage = fakeStorage();
    expect(loadRememberedName(storage)).toBe('');
    rememberName(storage, 'Bob');
    expect(loadRememberedName(storage)).toBe('Bob');
  });

  it('remembers the player color, ignoring anything that is not a real color', () => {
    const storage = fakeStorage();
    expect(loadRememberedColor(storage)).toBe('red');
    rememberColor(storage, 'purple');
    expect(loadRememberedColor(storage)).toBe('purple');
    storage.setItem('customTabletop.playerColor', 'magenta');
    expect(loadRememberedColor(storage)).toBe('red');
  });

  it('never throws when storage itself throws (blocked/disabled storage)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadLastJoin(broken)).toBeNull();
    expect(() => saveLastJoin(broken, { playerName: 'A', sessionId: 'B' })).not.toThrow();
    expect(() => clearLastJoin(broken)).not.toThrow();
    expect(loadRememberedName(broken)).toBe('');
  });
});
