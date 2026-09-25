import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  MAX_SCENES_PER_SESSION,
  SocketEvent,
  type GameState,
  type SceneDeleteResponse,
  type SceneUpdateResponse,
  type SessionJoinResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';
import { parseSceneCreateRequest, parseSceneUpdateRequest } from './validation.js';

// Several maps per table (docs/decisions.md, "Maps").

function table() {
  const store = new SessionStore();
  store.join('ROOM', 'alice', 'Alice');
  store.join('ROOM', 'bob', 'Bob');
  return store;
}

describe('maps in the store', () => {
  it('the host prepares a map without showing it, then puts it on the table', () => {
    const store = table();
    expect(store.createScene('ROOM', 'alice', 'dungeon', 'Dungeon', '').ok).toBe(true);
    let state = store.get('ROOM')!;
    expect(state.activeSceneId).toBe('default');
    store.updateScene('ROOM', 'alice', 'dungeon', {
      backgroundImage: '/uploads/d.jpg',
      gridCells: 20,
    });
    state = store.get('ROOM')!;
    expect(state.scenes.find((scene) => scene.id === 'default')!.backgroundImage).toBe('');

    store.changeScene('ROOM', 'alice', 'dungeon');
    state = store.get('ROOM')!;
    expect(state.activeSceneId).toBe('dungeon');
    const last = state.log.at(-1);
    expect(last && 'text' in last && last.text).toBe('Alice put “Dungeon” on the table');
  });

  it('keeps each map’s drawings to itself', () => {
    const store = table();
    store.createScene('ROOM', 'alice', 'dungeon', 'Dungeon', '');
    store.startDrawing('ROOM', 'default', 'd1', 'bob', { x: 1, y: 1 }, '#000000', 4);
    store.changeScene('ROOM', 'alice', 'dungeon');
    store.startDrawing('ROOM', 'dungeon', 'd2', 'bob', { x: 2, y: 2 }, '#000000', 4);
    const scenes = store.get('ROOM')!.scenes;
    expect(scenes.find((scene) => scene.id === 'default')!.drawings.map((d) => d.id)).toEqual([
      'd1',
    ]);
    expect(scenes.find((scene) => scene.id === 'dungeon')!.drawings.map((d) => d.id)).toEqual([
      'd2',
    ]);
  });

  it('deletes a map, but never the one on the table (so never the last)', () => {
    const store = table();
    store.createScene('ROOM', 'alice', 'dungeon', 'Dungeon', '');
    expect(store.deleteScene('ROOM', 'alice', 'default')).toMatchObject({ ok: false });
    expect(store.deleteScene('ROOM', 'bob', 'dungeon')).toMatchObject({ ok: false });
    expect(store.deleteScene('ROOM', 'alice', 'dungeon').ok).toBe(true);
    expect(store.get('ROOM')!.scenes.map((scene) => scene.id)).toEqual(['default']);
  });

  it('holds at most so many maps', () => {
    const store = table();
    for (let i = 1; i < MAX_SCENES_PER_SESSION; i += 1) {
      expect(store.createScene('ROOM', 'alice', `map-${i}`, `Map ${i}`, '').ok).toBe(true);
    }
    expect(store.createScene('ROOM', 'alice', 'one-too-many', 'Extra', '')).toMatchObject({
      ok: false,
    });
  });

  it('names are trimmed and kept short', () => {
    const base = { sessionId: 'ROOM', playerId: 'alice', sceneId: 's', backgroundImage: '' };
    expect(parseSceneCreateRequest({ ...base, name: '  Tavern  ' })?.name).toBe('Tavern');
    expect(parseSceneCreateRequest({ ...base, name: 'x'.repeat(41) })).toBeNull();
    expect(parseSceneUpdateRequest({ ...base, name: '   ' })).toBeNull();
    expect(parseSceneUpdateRequest({ ...base, name: ' Crypt ' })?.name).toBe('Crypt');
  });
});

describe('maps over the wire', () => {
  let app: AppServer;
  let url: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    app = createAppServer();
    await new Promise<void>((resolve) => app.http.listen(0, () => resolve()));
    const address = app.http.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    url = `http://localhost:${address.port}`;
    clients = [];
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    app.io.close();
    await new Promise<void>((resolve) => app.http.close(() => resolve()));
  });

  async function connect(playerId: string): Promise<ClientSocket> {
    const client = ioClient(url, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));
    await new Promise<SessionJoinResponse>((resolve) =>
      client.emit(
        SocketEvent.SessionJoin,
        { sessionId: 'ROOM', playerId, playerName: playerId, playerToken: `token-${playerId}` },
        resolve,
      ),
    );
    return client;
  }

  const emitAck = <T>(client: ClientSocket, event: string, payload: unknown) =>
    new Promise<T>((resolve) => client.emit(event, payload, resolve));

  it('the host creates, shows and deletes maps; everyone gets the new table', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const created = await emitAck<SceneUpdateResponse>(alice, SocketEvent.SceneCreate, {
      sessionId: 'ROOM',
      playerId: 'alice',
      sceneId: 'crypt',
      name: 'Crypt',
      backgroundImage: '',
    });
    expect(created.ok).toBe(true);

    // The create's own broadcast may still be on its way: wait for the switch.
    const shown = new Promise<GameState>((resolve) => {
      const listen = (state: GameState) => {
        if (state.activeSceneId !== 'crypt') return;
        bob.off(SocketEvent.SessionState, listen);
        resolve(state);
      };
      bob.on(SocketEvent.SessionState, listen);
    });
    await emitAck(alice, SocketEvent.SceneChange, {
      sessionId: 'ROOM',
      playerId: 'alice',
      sceneId: 'crypt',
    });
    expect((await shown).activeSceneId).toBe('crypt');

    expect(
      await emitAck<SceneDeleteResponse>(bob, SocketEvent.SceneDelete, {
        sessionId: 'ROOM',
        playerId: 'bob',
        sceneId: 'default',
      }),
    ).toMatchObject({ ok: false });
    const deleted = await emitAck<SceneDeleteResponse>(alice, SocketEvent.SceneDelete, {
      sessionId: 'ROOM',
      playerId: 'alice',
      sceneId: 'default',
    });
    expect(deleted.ok && deleted.state.scenes.map((scene) => scene.id)).toEqual(['crypt']);
  });
});
