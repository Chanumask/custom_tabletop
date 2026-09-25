import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  HOST_ONLY_ERROR,
  REMOVED_FROM_TABLE_ERROR,
  SOUNDS_OFF_ERROR,
  SocketEvent,
  TABLE_LOCKED_ERROR,
  type GameState,
  type HostActionResponse,
  type SessionJoinResponse,
  type SessionPatch,
  type SessionPeekResponse,
  type SessionRemoved,
  type SoundPlayResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';

// The host's controls (docs/decisions.md, "Host controls").

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

async function connect(): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  return client;
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

function join(client: ClientSocket, playerId: string): Promise<SessionJoinResponse> {
  return emitAck(client, SocketEvent.SessionJoin, {
    sessionId: 'ROOM',
    playerId,
    playerName: playerId,
    playerToken: `token-${playerId}`,
  });
}

function host(client: ClientSocket, playerId: string, action: object) {
  return emitAck<HostActionResponse>(client, SocketEvent.HostAction, {
    sessionId: 'ROOM',
    playerId,
    ...action,
  });
}

const next = <T>(client: ClientSocket, event: string) =>
  new Promise<T>((resolve) => client.once(event, resolve));

/** Resolves true if `event` arrives within `ms`, false otherwise. */
const arrives = (client: ClientSocket, event: string, ms = 150) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    client.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

describe('host controls', () => {
  it('only the host can use them', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    for (const action of [
      { action: 'lock', locked: true },
      { action: 'permission', permission: 'draw', allowed: false },
      { action: 'remove', targetPlayerId: 'alice' },
      { action: 'clear', target: 'dice' },
    ]) {
      expect(await host(bob, 'bob', action)).toEqual({ ok: false, error: HOST_ONLY_ERROR });
    }
    expect(await host(alice, 'alice', { action: 'explode' })).toMatchObject({ ok: false });
  });

  it('a locked table keeps newcomers out but lets its players back in', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    const seen = next<SessionPatch>(bob, SocketEvent.SessionPatch);
    expect(await host(alice, 'alice', { action: 'lock', locked: true })).toMatchObject({
      ok: true,
    });
    expect((await seen).patch.locked).toBe(true);

    const peek = await emitAck<SessionPeekResponse>(await connect(), SocketEvent.SessionPeek, {
      sessionId: 'ROOM',
    });
    expect(peek.locked).toBe(true);
    expect(await join(await connect(), 'carol')).toEqual({ ok: false, error: TABLE_LOCKED_ERROR });

    // Bob drops and comes back: still welcome.
    bob.disconnect();
    expect(await join(await connect(), 'bob')).toMatchObject({ ok: true });

    await host(alice, 'alice', { action: 'lock', locked: false });
    expect(await join(await connect(), 'carol')).toMatchObject({ ok: true });
  });

  it('removes a player: they are told, dropped from the table and kept out', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    const told = next<SessionRemoved>(bob, SocketEvent.SessionRemoved);
    const result = await host(alice, 'alice', { action: 'remove', targetPlayerId: 'bob' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.map((player) => player.id)).toEqual(['alice']);
    expect(result.state.log.at(-1)).toMatchObject({
      kind: 'system',
      text: 'bob was removed by alice',
    });
    expect(await told).toEqual({ sessionId: 'ROOM' });

    // The old connection no longer speaks for Bob, or hears the table.
    const stillHears = arrives(bob, SocketEvent.SessionPatch);
    await host(alice, 'alice', { action: 'lock', locked: true });
    expect(await stillHears).toBe(false);

    // And he can't just walk back in, even once the table is open again.
    await host(alice, 'alice', { action: 'lock', locked: false });
    expect(await join(await connect(), 'bob')).toEqual({
      ok: false,
      error: REMOVED_FROM_TABLE_ERROR,
    });
    expect(await host(alice, 'alice', { action: 'remove', targetPlayerId: 'alice' })).toMatchObject(
      {
        ok: false,
      },
    );
  });

  it('with sounds off, only the host plays them', async () => {
    const alice = await connect();
    const bob = await connect();
    const joined = await join(alice, 'alice');
    await join(bob, 'bob');
    if (!joined.ok) throw new Error('join failed');
    const soundId = joined.state.soundboard[0]!.id;
    await host(alice, 'alice', { action: 'permission', permission: 'sounds', allowed: false });

    const play = (client: ClientSocket, playerId: string) =>
      emitAck<SoundPlayResponse>(client, SocketEvent.SoundPlay, {
        sessionId: 'ROOM',
        playerId,
        soundId,
      });
    expect(await play(bob, 'bob')).toEqual({ ok: false, error: SOUNDS_OFF_ERROR });
    expect(await play(alice, 'alice')).toEqual({ ok: true });
  });

  it('with drawing off, strokes from players go nowhere, the host’s still do', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    await host(alice, 'alice', { action: 'permission', permission: 'draw', allowed: false });

    const stroke = (client: ClientSocket, playerId: string, drawingId: string) =>
      client.emit(SocketEvent.DrawingStart, {
        sessionId: 'ROOM',
        playerId,
        sceneId: 'default',
        drawingId,
        point: { x: 10, y: 10 },
        color: '#000000',
        width: 4,
      });
    const aliceSeesBob = arrives(alice, SocketEvent.DrawingStart);
    stroke(bob, 'bob', 'bob-stroke');
    expect(await aliceSeesBob).toBe(false);
    const bobSeesAlice = arrives(bob, SocketEvent.DrawingStart);
    stroke(alice, 'alice', 'alice-stroke');
    expect(await bobSeesAlice).toBe(true);
  });

  it('clearing the drawings sends everyone the fresh map', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    alice.emit(SocketEvent.DrawingStart, {
      sessionId: 'ROOM',
      playerId: 'alice',
      sceneId: 'default',
      drawingId: 'd1',
      point: { x: 10, y: 10 },
      color: '#000000',
      width: 4,
    });
    await next(bob, SocketEvent.DrawingStart);

    const fresh = next<GameState>(bob, SocketEvent.SessionState);
    expect(await host(alice, 'alice', { action: 'clear', target: 'drawings' })).toMatchObject({
      ok: true,
    });
    expect((await fresh).scenes[0]!.drawings).toEqual([]);
  });
});

describe('SessionStore host controls', () => {
  function table() {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    return store;
  }

  it('clears each kind of thing, and says so only when something went', () => {
    const store = table();
    store.spawnDice('ROOM', 'd1', 'bob', { x: 0, y: 1, z: 0 });
    store.moveMini('ROOM', 'bob', 'bob', { x: 100, y: 100 });
    store.writeWhiteboard('ROOM', 'bob', ['Session 3', ...Array<null>(7).fill(null)]);

    const texts = () => store.get('ROOM')!.log.map((entry) => ('text' in entry ? entry.text : ''));
    store.clearTable('ROOM', 'alice', 'dice');
    store.clearTable('ROOM', 'alice', 'minis');
    store.clearTable('ROOM', 'alice', 'whiteboard');
    const state = store.get('ROOM')!;
    expect(state.dice).toEqual([]);
    expect(state.minis).toEqual({});
    expect(state.whiteboard.every((line) => !line.text)).toBe(true);
    expect(texts().slice(-3)).toEqual([
      'Alice took all the dice off the table',
      'Alice took all the minis off the table',
      'Alice wiped the whiteboard',
    ]);

    const before = state.log.length;
    store.clearTable('ROOM', 'alice', 'dice');
    store.setLocked('ROOM', 'alice', false);
    expect(store.get('ROOM')!.log.length).toBe(before);
  });

  it('a reopened table starts unlocked but keeps its rules', () => {
    const store = table();
    store.setLocked('ROOM', 'alice', true);
    store.setPermission('ROOM', 'alice', 'draw', false);
    const saved = store.snapshot('ROOM')!;
    const reopened = new SessionStore();
    reopened.restore({ ...saved, credentialHashes: {}, state: { ...saved.state, players: [] } });
    const state = reopened.join('ROOM', 'alice', 'Alice');
    expect(state.locked).toBe(false);
    expect(state.permissions).toEqual({ draw: false, sounds: true });
  });

  it('a save from before host controls gets the defaults', () => {
    const store = table();
    const saved = store.snapshot('ROOM')!;
    const older: Partial<GameState> = { ...saved.state };
    delete older.locked;
    delete older.permissions;
    const restored = new SessionStore().restore({ ...saved, state: older as GameState });
    expect(restored.locked).toBe(false);
    expect(restored.permissions).toEqual({ draw: true, sounds: true });
  });
});
