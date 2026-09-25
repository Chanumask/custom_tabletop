import { describe, expect, it } from 'vitest';
import { SessionStore } from './sessionStore.js';
import { DIE_FACES, DIE_KINDS, MAX_DICE_PER_SESSION } from '@custom-tabletop/shared';

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

  it('gives a joiner their preferred color if free, otherwise the first free one', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice', undefined, 'green');
    store.join('abc', 'p2', 'Bob', undefined, 'green'); // taken -> first free
    const state = store.join('abc', 'p3', 'Carol'); // no preference -> first free

    expect(state.players.map((player) => player.color)).toEqual(['green', 'red', 'blue']);
  });

  it('a rejoining player keeps their color regardless of preference', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice', undefined, 'purple');
    const state = store.join('abc', 'p1', 'Alice', undefined, 'orange');
    expect(state.players[0]?.color).toBe('purple');
  });

  it('admits at most eight players, but always admits a returning one', () => {
    const store = new SessionStore();
    for (let i = 1; i <= 8; i += 1) {
      store.join('abc', `p${i}`, `Player ${i}`);
    }
    expect(store.canAdmit('abc', 'p9')).toBe(false);
    expect(store.canAdmit('abc', 'p3')).toBe(true);
    expect(store.canAdmit('fresh', 'anyone')).toBe(true);
    expect(() => store.join('abc', 'p9', 'Too many')).toThrow();
  });

  it('peek summarizes a session without joining it', () => {
    const store = new SessionStore();
    expect(store.peek('abc')).toEqual({
      exists: false,
      playerCount: 0,
      hostName: null,
      takenColors: [],
    });

    store.join('abc', 'p1', 'Alice', undefined, 'yellow');
    store.join('abc', 'p2', 'Bob', undefined, 'blue');
    expect(store.peek('abc')).toEqual({
      exists: true,
      playerCount: 2,
      hostName: 'Alice',
      takenColors: ['yellow', 'blue'],
    });
  });

  it('updateProfile renames and recolors, but refuses a color someone else wears', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice', undefined, 'red');
    store.join('abc', 'p2', 'Bob', undefined, 'blue');

    expect(store.updateProfile('abc', 'p2', { color: 'red' })).toEqual({
      ok: false,
      error: 'That color is already taken.',
    });

    const result = store.updateProfile('abc', 'p2', { name: 'Robert', color: 'orange' });
    expect(result.ok).toBe(true);
    const bob = store.get('abc')?.players.find((player) => player.id === 'p2');
    expect(bob).toMatchObject({ name: 'Robert', color: 'orange' });

    // Re-selecting your own current color is not a conflict.
    expect(store.updateProfile('abc', 'p1', { color: 'red' }).ok).toBe(true);
  });

  it('a new player starts connected', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    expect(state.players[0]?.connected).toBe(true);
  });

  it('rejoining as an existing player requires the credential it first joined with', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice', 'secret-1');

    expect(store.authorizeJoin('abc', 'p1', 'secret-1')).toBe(true);
    expect(store.authorizeJoin('abc', 'p1', 'someone-elses-guess')).toBe(false);
    // A brand-new player id has nothing to check against yet.
    expect(store.authorizeJoin('abc', 'p2', 'anything')).toBe(true);
  });

  it("a player's credential is forgotten once they leave", () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice', 'secret-1');
    store.join('abc', 'p2', 'Bob', 'secret-2');
    store.leave('abc', 'p2');

    expect(store.authorizeJoin('abc', 'p2', 'fresh-secret')).toBe(true);
  });

  it('setConnected flips presence, and a rejoin marks the player connected again', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');

    expect(store.setConnected('abc', 'p1', false)?.players[0]?.connected).toBe(false);
    expect(store.join('abc', 'p1', 'Alice').players[0]?.connected).toBe(true);
  });

  it('removeIfDisconnected removes a still-disconnected player but spares one who came back', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');
    store.join('abc', 'p3', 'Carol');
    store.setConnected('abc', 'p2', false);
    store.setConnected('abc', 'p3', false);
    store.join('abc', 'p3', 'Carol'); // Carol reconnected in time

    expect(store.removeIfDisconnected('abc', 'p2').removed).toBe(true);
    expect(store.removeIfDisconnected('abc', 'p3').removed).toBe(false);
    expect(store.get('abc')?.players.map((player) => player.id)).toEqual(['p1', 'p3']);
  });

  it('the host leaving hands the host role to the longest-present connected player', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');
    store.join('abc', 'p3', 'Carol');
    store.setConnected('abc', 'p2', false);

    expect(store.leave('abc', 'p1')?.hostId).toBe('p3');
  });

  it('the host leaving falls back to a disconnected player if nobody else is connected', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');
    store.setConnected('abc', 'p2', false);

    expect(store.leave('abc', 'p1')?.hostId).toBe('p2');
  });

  it('transferHost hands the host role over, host-only', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');

    expect(store.transferHost('abc', 'p2', 'p2')).toEqual({
      ok: false,
      error: 'Only the host can hand over the host role.',
    });
    expect(store.transferHost('abc', 'p1', 'nobody')).toEqual({
      ok: false,
      error: 'Player not found.',
    });
    const result = store.transferHost('abc', 'p1', 'p2');
    expect(result.ok && result.state.hostId).toBe('p2');
  });

  it('move updates an existing player position and rotation in place', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');

    const moved = store.move('abc', 'p1', { x: 1, y: 1.7, z: -2 }, 1.5);

    expect(moved).toBe(true);
    expect(store.get('abc')?.players[0]).toMatchObject({
      position: { x: 1, y: 1.7, z: -2 },
      rotationY: 1.5,
    });
  });

  it('move on an unknown session is a no-op that returns false', () => {
    const store = new SessionStore();
    expect(store.move('nope', 'p1', { x: 0, y: 0, z: 0 }, 0)).toBe(false);
  });

  it('move for a player not in the session is a no-op that returns false', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.move('abc', 'p2', { x: 0, y: 0, z: 0 }, 0)).toBe(false);
  });

  it('a fresh session starts with one default scene, active', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');

    expect(state.scenes).toHaveLength(1);
    expect(state.activeSceneId).toBe(state.scenes[0]!.id);
    expect(state.scenes[0]!.backgroundImage).toBe('');
  });

  it('createScene adds a scene without switching to it, host-only', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    const before = store.get('abc')!.activeSceneId;

    const result = store.createScene(
      'abc',
      'p1',
      'scene-2',
      'Dungeon',
      'https://example/dungeon.png',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.scenes.map((s) => s.id)).toContain('scene-2');
    expect(result.state.activeSceneId).toBe(before);
  });

  it('createScene rejects a non-host caller', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');

    const result = store.createScene('abc', 'p2', 'scene-2', 'Dungeon', '');
    expect(result).toEqual({ ok: false, error: 'Only the host can create a scene.' });
  });

  it('changeScene switches the active scene, host-only', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.createScene('abc', 'p1', 'scene-2', 'Dungeon', '');

    const result = store.changeScene('abc', 'p1', 'scene-2');
    expect(result.ok).toBe(true);
    expect(store.get('abc')?.activeSceneId).toBe('scene-2');
  });

  it('changeScene rejects an unknown scene id', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.changeScene('abc', 'p1', 'nope')).toEqual({
      ok: false,
      error: 'Scene not found.',
    });
  });

  it('updateScene patches only the given fields, host-only', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;

    const result = store.updateScene('abc', 'p1', sceneId, {
      backgroundImage: 'https://example/map.png',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.scenes[0]).toMatchObject({
      name: 'Map', // unchanged
      backgroundImage: 'https://example/map.png',
    });
  });

  it('startDrawing adds a new stroke to the given scene', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;

    const started = store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 10, y: 20 }, '#241a12', 5);
    expect(started).toBe(true);
    expect(store.get('abc')?.scenes[0]?.drawings).toEqual([
      {
        id: 'd1',
        sceneId,
        playerId: 'p1',
        points: [{ x: 10, y: 20 }],
        color: '#241a12',
        width: 5,
      },
    ]);
  });

  it('startDrawing on an unknown scene is a no-op that returns false', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.startDrawing('abc', 'nope', 'd1', 'p1', { x: 0, y: 0 }, '#241a12', 5)).toBe(false);
  });

  it('appendDrawingPoint extends an in-progress stroke', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;
    store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 0, y: 0 }, '#241a12', 5);

    const appended = store.appendDrawingPoint('abc', 'd1', { x: 5, y: 5 }, 'p1');
    expect(appended).toBe(true);
    expect(store.get('abc')?.scenes[0]?.drawings[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
  });

  it('appendDrawingPoint for an unknown drawing is a no-op that returns false', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.appendDrawingPoint('abc', 'nope', { x: 0, y: 0 }, 'p1')).toBe(false);
  });

  it("appendDrawingPoint refuses to extend another player's stroke", () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');
    const sceneId = state.scenes[0]!.id;
    store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 0, y: 0 }, '#241a12', 5);

    expect(store.appendDrawingPoint('abc', 'd1', { x: 9, y: 9 }, 'p2')).toBe(false);
    expect(store.get('abc')?.scenes[0]?.drawings[0]?.points).toEqual([{ x: 0, y: 0 }]);
  });

  it('deleteDrawing removes just that stroke from the scene', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;
    store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 0, y: 0 }, '#241a12', 5);
    store.startDrawing('abc', sceneId, 'd2', 'p1', { x: 1, y: 1 }, '#241a12', 5);

    const deleted = store.deleteDrawing('abc', sceneId, 'd1');
    expect(deleted).toBe(true);
    expect(store.get('abc')?.scenes[0]?.drawings.map((d) => d.id)).toEqual(['d2']);
  });

  it('deleteDrawing for an unknown drawing is a no-op that returns false', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;
    expect(store.deleteDrawing('abc', sceneId, 'nope')).toBe(false);
  });

  it('spawnDice adds a new die at the given position, unrolled', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');

    const result = store.spawnDice('abc', 'p1', 'd1', { x: 0.2, y: 0.8, z: -0.1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.dice).toEqual([
      {
        id: 'd1',
        ownerId: 'p1',
        kind: 'd6',
        position: { x: 0.2, y: 0.8, z: -0.1 },
        result: null,
        rollCount: 0,
        rolledBy: null,
      },
    ]);
  });

  it('spawnDice rejects a duplicate dice id', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.spawnDice('abc', 'p1', 'd1', { x: 0, y: 0, z: 0 });

    const result = store.spawnDice('abc', 'p1', 'd1', { x: 1, y: 1, z: 1 });
    expect(result).toEqual({ ok: false, error: 'A die with that id already exists.' });
  });

  it('spawnDice on an unknown session returns an error', () => {
    const store = new SessionStore();
    expect(store.spawnDice('nope', 'p1', 'd1', { x: 0, y: 0, z: 0 })).toEqual({
      ok: false,
      error: 'Session not found.',
    });
  });

  it('rollDice sets a result between 1 and 6', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.spawnDice('abc', 'p1', 'd1', { x: 0, y: 0, z: 0 });

    const result = store.rollDice('abc', ['d1']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const die = result.state.dice[0]!;
    expect(die.result).not.toBeNull();
    expect(die.result).toBeGreaterThanOrEqual(1);
    expect(die.result).toBeLessThanOrEqual(6);
  });

  it('rollDice for an unknown die returns an error', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.rollDice('abc', ['nope'])).toEqual({ ok: false, error: 'Die not found.' });
  });

  it('rollDice covers every face of each kind, and only those', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    for (const kind of DIE_KINDS) {
      store.spawnDice('abc', 'p1', kind, { x: 0, y: 0, z: 0 }, kind);
      const faces = DIE_FACES[kind];
      const seen = new Set<number>();
      // Walk the random source across [0, 1) so every face must come up.
      for (let i = 0; i < faces; i++) {
        const result = store.rollDice('abc', [kind], 'p1', () => (i + 0.5) / faces);
        if (!result.ok) throw new Error(result.error);
        seen.add(result.state.dice.find((die) => die.id === kind)!.result!);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual(
        Array.from({ length: faces }, (_, index) => index + 1),
      );
    }
  });

  it('a re-roll to the same number still counts as a new roll', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');
    store.spawnDice('abc', 'p1', 'd1', { x: 0, y: 0, z: 0 }, 'd20');

    store.rollDice('abc', ['d1'], 'p1', () => 0.5);
    const again = store.rollDice('abc', ['d1'], 'p2', () => 0.5);
    if (!again.ok) throw new Error(again.error);
    expect(again.state.dice[0]).toMatchObject({ result: 11, rollCount: 2, rolledBy: 'p2' });
  });

  it('rolls a pool together, or nothing if any die is missing', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.spawnDice('abc', 'p1', 'a', { x: 0, y: 0, z: 0 });
    store.spawnDice('abc', 'p1', 'b', { x: 0, y: 0, z: 0 }, 'd8');

    expect(store.rollDice('abc', ['a', 'missing']).ok).toBe(false);
    const state = store.join('abc', 'p1', 'Alice');
    expect(state.dice.every((die) => die.rollCount === 0)).toBe(true);

    const pool = store.rollDice('abc', ['a', 'b', 'a'], 'p1');
    if (!pool.ok) throw new Error(pool.error);
    // A duplicated id rolls that die once.
    expect(pool.state.dice.map((die) => die.rollCount)).toEqual([1, 1]);
  });

  it('caps the number of dice on the table', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    for (let i = 0; i < MAX_DICE_PER_SESSION; i++) {
      expect(store.spawnDice('abc', 'p1', `d${i}`, { x: 0, y: 0, z: 0 }).ok).toBe(true);
    }
    expect(store.spawnDice('abc', 'p1', 'one-too-many', { x: 0, y: 0, z: 0 }).ok).toBe(false);
  });

  it('removeDice removes just that die', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.spawnDice('abc', 'p1', 'd1', { x: 0, y: 0, z: 0 });
    store.spawnDice('abc', 'p1', 'd2', { x: 1, y: 0, z: 1 });

    const result = store.removeDice('abc', 'd1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.dice.map((d) => d.id)).toEqual(['d2']);
  });

  it('removeDice for an unknown die returns an error', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.removeDice('abc', 'nope')).toEqual({ ok: false, error: 'Die not found.' });
  });

  it('isHost is true for the host and false for everyone else', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');

    expect(store.isHost('abc', 'p1')).toBe(true);
    expect(store.isHost('abc', 'p2')).toBe(false);
    expect(store.isHost('nope', 'p1')).toBe(false);
  });

  it('setMuted lets a player mute themselves', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');

    const result = store.setMuted('abc', 'p2', 'p2', true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.find((p) => p.id === 'p2')?.muted).toBe(true);
  });

  it('setMuted lets the host mute another player', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');

    const result = store.setMuted('abc', 'p1', 'p2', true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.find((p) => p.id === 'p2')?.muted).toBe(true);
  });

  it('setMuted rejects a non-host muting someone else', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.join('abc', 'p2', 'Bob');
    store.join('abc', 'p3', 'Carol');

    const result = store.setMuted('abc', 'p2', 'p3', true);
    expect(result).toEqual({ ok: false, error: 'Only the host can mute another player.' });
  });

  it('setMuted(false) unmutes', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    store.setMuted('abc', 'p1', 'p1', true);

    const result = store.setMuted('abc', 'p1', 'p1', false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.muted).toBe(false);
  });

  it('setMuted for an unknown player returns an error', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.setMuted('abc', 'p1', 'nope', true)).toEqual({
      ok: false,
      error: 'Player not found.',
    });
  });

  it('setMuted on an unknown session returns an error', () => {
    const store = new SessionStore();
    expect(store.setMuted('nope', 'p1', 'p1', true)).toEqual({
      ok: false,
      error: 'Session not found.',
    });
  });
});
