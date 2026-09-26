import { describe, expect, it } from 'vitest';
import { SessionStore } from './sessionStore.js';
import { parseObjectInteractRequest } from './validation.js';

describe('SessionStore.setSeated', () => {
  function table() {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice', undefined, 'red');
    store.join('abc', 'bob', 'Bob', undefined, 'blue');
    return store;
  }

  it('sits a player on the chair they asked for, and frees it when they stand', () => {
    const store = table();
    const sat = store.setSeated('abc', 'alice', true, 2);
    expect(sat.ok && sat.state.players[0]).toMatchObject({ seated: true, seatIndex: 2 });

    const stood = store.setSeated('abc', 'alice', false);
    expect(stood.ok && stood.state.players[0]).toMatchObject({ seated: false, seatIndex: null });
  });

  it('never puts two players on one chair', () => {
    const store = table();
    store.setSeated('abc', 'alice', true, 2);
    expect(store.setSeated('abc', 'bob', true, 2)).toEqual({
      ok: false,
      error: 'Someone just took that chair — try again.',
    });
    expect(store.setSeated('abc', 'bob', true, 3).ok).toBe(true);
    // Once Alice stands, her chair is free again.
    store.setSeated('abc', 'alice', false);
    store.setSeated('abc', 'bob', false);
    expect(store.setSeated('abc', 'bob', true, 2).ok).toBe(true);
  });

  it('is explicit: standing up twice leaves the player standing', () => {
    const store = table();
    store.setSeated('abc', 'alice', false);
    const again = store.setSeated('abc', 'alice', false);
    expect(again.ok && again.state.players[0]!.seated).toBe(false);
  });

  it('still toggles for a request without an explicit seated flag', () => {
    const store = table();
    const first = store.toggleSeated('abc', 'bob');
    expect(first.ok && first.state.players[1]).toMatchObject({ seated: true, seatIndex: null });
    const second = store.toggleSeated('abc', 'bob');
    expect(second.ok && second.state.players[1]!.seated).toBe(false);
  });
});

describe('parseObjectInteractRequest seat fields', () => {
  const base = { sessionId: 's', playerId: 'p', objectId: 'table' };

  it('passes an explicit sit with a chair through', () => {
    expect(parseObjectInteractRequest({ ...base, seated: true, seatIndex: 4 })).toEqual({
      ...base,
      seated: true,
      seatIndex: 4,
    });
  });

  it.each([
    { ...base, seated: 'yes' },
    { ...base, seated: true, seatIndex: -1 },
    { ...base, seated: true, seatIndex: 1.5 },
    { ...base, seated: true, seatIndex: 64 },
  ])('rejects %j', (payload) => {
    expect(parseObjectInteractRequest(payload)).toBeNull();
  });
});

describe('parseObjectInteractRequest targets', () => {
  it('takes a soundboard sound on the record player (a uuid is long)', () => {
    const target = 'sound:3f2b9c1e-8d4a-4c55-9e1b-7a6f0c2d5e88';
    expect(
      parseObjectInteractRequest({ sessionId: 's', playerId: 'p', objectId: 'record', target }),
    ).toMatchObject({ target });
    expect(
      parseObjectInteractRequest({
        sessionId: 's',
        playerId: 'p',
        objectId: 'record',
        target: 'x'.repeat(81),
      }),
    ).toBeNull();
  });
});
