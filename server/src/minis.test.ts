import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  TABLE_UNITS,
  type DiceMoved,
  type DiceSpawnResponse,
  type MiniMoved,
  type SessionJoinResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';

// Minis and dragged dice (docs/decisions.md, "Minis").

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

async function stateOf(client: ClientSocket, playerId: string) {
  const joined = await join(client, playerId);
  if (!joined.ok) throw new Error('join failed');
  return joined.state;
}

describe('minis', () => {
  it('a player puts their mini on the table and moves it; others see it, a late joiner too', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    const seen = next<MiniMoved>(alice, SocketEvent.MiniMoved);
    bob.emit(SocketEvent.MiniMove, {
      sessionId: 'ROOM',
      playerId: 'bob',
      targetPlayerId: 'bob',
      point: { x: 300, y: 400 },
    });
    expect(await seen).toEqual({
      sessionId: 'ROOM',
      targetPlayerId: 'bob',
      point: { x: 300, y: 400 },
    });

    const carol = await connect();
    expect((await stateOf(carol, 'carol')).minis).toEqual({ bob: { x: 300, y: 400 } });
  });

  it('keeps minis on the table surface', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    const seen = next<MiniMoved>(alice, SocketEvent.MiniMoved);
    bob.emit(SocketEvent.MiniMove, {
      sessionId: 'ROOM',
      playerId: 'bob',
      targetPlayerId: 'bob',
      point: { x: -50, y: 99999 },
    });
    expect((await seen).point).toEqual({ x: 0, y: TABLE_UNITS });
  });

  it("only the host may move someone else's mini", async () => {
    const alice = await connect(); // host
    const bob = await connect();
    const carol = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    await join(carol, 'carol');

    const refused = arrives(alice, SocketEvent.MiniMoved);
    carol.emit(SocketEvent.MiniMove, {
      sessionId: 'ROOM',
      playerId: 'carol',
      targetPlayerId: 'bob',
      point: { x: 1, y: 1 },
    });
    expect(await refused).toBe(false);

    const allowed = next<MiniMoved>(bob, SocketEvent.MiniMoved);
    alice.emit(SocketEvent.MiniMove, {
      sessionId: 'ROOM',
      playerId: 'alice',
      targetPlayerId: 'bob',
      point: { x: 512, y: 512 },
    });
    expect((await allowed).targetPlayerId).toBe('bob');
  });

  it('taking a mini off the table, or leaving, removes it', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    store.moveMini('ROOM', 'alice', 'alice', { x: 10, y: 10 });
    store.moveMini('ROOM', 'bob', 'bob', { x: 20, y: 20 });
    store.moveMini('ROOM', 'alice', 'alice', null);
    expect(store.get('ROOM')!.minis).toEqual({ bob: { x: 20, y: 20 } });
    store.leave('ROOM', 'bob');
    expect(store.get('ROOM')!.minis).toEqual({});
  });
});

describe('dragging dice', () => {
  async function tableWithBobsDie() {
    const alice = await connect(); // host
    const bob = await connect();
    const carol = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    await join(carol, 'carol');
    const spawned = await emitAck<DiceSpawnResponse>(bob, SocketEvent.DiceSpawn, {
      sessionId: 'ROOM',
      playerId: 'bob',
      diceId: 'd1',
      position: { x: 0, y: 0.78, z: 0 },
      kind: 'd20',
    });
    expect(spawned.ok).toBe(true);
    return { alice, bob, carol };
  }

  it('the owner drags their die; everyone else sees it move', async () => {
    const { alice, bob } = await tableWithBobsDie();
    const seen = next<DiceMoved>(alice, SocketEvent.DiceMoved);
    bob.emit(SocketEvent.DiceMove, {
      sessionId: 'ROOM',
      playerId: 'bob',
      diceId: 'd1',
      position: { x: 0.4, y: 0.78, z: -0.3 },
    });
    expect((await seen).position).toEqual({ x: 0.4, y: 0.78, z: -0.3 });
  });

  it("others can't move it, the host can; absurd positions are ignored", async () => {
    const { alice, bob, carol } = await tableWithBobsDie();
    const refused = arrives(bob, SocketEvent.DiceMoved);
    carol.emit(SocketEvent.DiceMove, {
      sessionId: 'ROOM',
      playerId: 'carol',
      diceId: 'd1',
      position: { x: 0.1, y: 0.78, z: 0.1 },
    });
    expect(await refused).toBe(false);

    const absurd = arrives(carol, SocketEvent.DiceMoved);
    bob.emit(SocketEvent.DiceMove, {
      sessionId: 'ROOM',
      playerId: 'bob',
      diceId: 'd1',
      position: { x: 5000, y: 0.78, z: 0 },
    });
    expect(await absurd).toBe(false);

    const allowed = next<DiceMoved>(carol, SocketEvent.DiceMoved);
    alice.emit(SocketEvent.DiceMove, {
      sessionId: 'ROOM',
      playerId: 'alice',
      diceId: 'd1',
      position: { x: -0.5, y: 0.78, z: 0.5 },
    });
    expect((await allowed).diceId).toBe('d1');
  });
});
