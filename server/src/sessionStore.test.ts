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

    const started = store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 10, y: 20 });
    expect(started).toBe(true);
    expect(store.get('abc')?.scenes[0]?.drawings).toEqual([
      { id: 'd1', sceneId, playerId: 'p1', points: [{ x: 10, y: 20 }] },
    ]);
  });

  it('startDrawing on an unknown scene is a no-op that returns false', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.startDrawing('abc', 'nope', 'd1', 'p1', { x: 0, y: 0 })).toBe(false);
  });

  it('appendDrawingPoint extends an in-progress stroke', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;
    store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 0, y: 0 });

    const appended = store.appendDrawingPoint('abc', 'd1', { x: 5, y: 5 });
    expect(appended).toBe(true);
    expect(store.get('abc')?.scenes[0]?.drawings[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
  });

  it('appendDrawingPoint for an unknown drawing is a no-op that returns false', () => {
    const store = new SessionStore();
    store.join('abc', 'p1', 'Alice');
    expect(store.appendDrawingPoint('abc', 'nope', { x: 0, y: 0 })).toBe(false);
  });

  it('deleteDrawing removes just that stroke from the scene', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'p1', 'Alice');
    const sceneId = state.scenes[0]!.id;
    store.startDrawing('abc', sceneId, 'd1', 'p1', { x: 0, y: 0 });
    store.startDrawing('abc', sceneId, 'd2', 'p1', { x: 1, y: 1 });

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
});
