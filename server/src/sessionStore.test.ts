import { describe, expect, it } from 'vitest';
import { SessionStore } from './sessionStore.js';

describe('SessionStore', () => {
  it('creates a session on first join and makes that player the host', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');

    expect(state.hostId).toBe('p1');
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({ id: 'p1', name: 'Alice' });
  });

  it('adds a second joiner as a non-host player in the same session', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    const state = store.join('abc', 'p2', 'Bob');

    expect(state.hostId).toBe('p1');
    expect(state.players.map((player) => player.id)).toEqual(['p1', 'p2']);
  });

  it('rejoining with the same playerId does not create a duplicate player', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    const state = store.join('abc', 'p1', 'Alice');

    expect(state.players).toHaveLength(1);
  });

  it('leave removes just that player from the session', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');

    const state = store.leave('abc', 'p2');

    expect(state?.players.map((player) => player.id)).toEqual(['p1']);
  });

  it('leaving as the last player deletes the session', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');

    const state = store.leave('abc', 'p1');

    expect(state).toBeUndefined();
    expect(store.get('abc')).toBeUndefined();
  });

  it('leave on an unknown session is a no-op that returns undefined', () => {
    const store = new SessionStore();
    expect(store.leave('nope', 'p1')).toBeUndefined();
  });
});
