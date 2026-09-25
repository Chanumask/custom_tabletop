import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SECRET_DICE_HOST_ONLY_ERROR,
  SocketEvent,
  type DiceRollResponse,
  type DiceSpawnResponse,
  type GameState,
  type SessionJoinResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';
import { viewFor } from './privacy.js';
import { onStateUpdates } from './testSupport.js';

// The host's secret dice (docs/decisions.md, "Secret dice"): never sent to
// anyone but their owner — not in acks, patches, snapshots or relays.

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

const emitAck = <T>(client: ClientSocket, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => client.emit(event, payload, resolve));

const join = (client: ClientSocket, playerId: string) =>
  emitAck<SessionJoinResponse>(client, SocketEvent.SessionJoin, {
    sessionId: 'ROOM',
    playerId,
    playerName: playerId,
    playerToken: `token-${playerId}`,
  });

const spawn = (client: ClientSocket, playerId: string, diceId: string, hidden: boolean) =>
  emitAck<DiceSpawnResponse>(client, SocketEvent.DiceSpawn, {
    sessionId: 'ROOM',
    playerId,
    diceId,
    position: { x: 0, y: 0.78, z: 0 },
    kind: 'd20',
    ...(hidden ? { hidden: true } : {}),
  });

const roll = (client: ClientSocket, playerId: string, diceIds: string[]) =>
  emitAck<DiceRollResponse>(client, SocketEvent.DiceRoll, { sessionId: 'ROOM', playerId, diceIds });

/** Everything a client receives, merged like the real client does. */
function follow(client: ClientSocket) {
  const view = { state: {} as GameState, raw: [] as string[] };
  onStateUpdates(client, (state) => {
    view.state = state;
  });
  client.onAny((_event, ...args) => view.raw.push(JSON.stringify(args)));
  return view;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

describe('secret dice', () => {
  it('only the host can roll in secret', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    expect(await spawn(bob, 'bob', 'b1', true)).toEqual({
      ok: false,
      error: SECRET_DICE_HOST_ONLY_ERROR,
    });
  });

  it("a secret die and its rolls never reach anyone else's browser", async () => {
    const alice = await connect(); // host
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    const bobSees = follow(bob);

    const spawned = await spawn(alice, 'alice', 'secret', true);
    expect(spawned.ok && spawned.state.dice.map((die) => die.id)).toEqual(['secret']);
    const rolled = await roll(alice, 'alice', ['secret']);
    expect(rolled.ok).toBe(true);
    const aliceLine = rolled.ok ? rolled.state.log.at(-1) : null;
    expect(aliceLine).toMatchObject({ kind: 'roll', visibleTo: 'alice' });

    // A scene change broadcasts full snapshots, too.
    await emitAck(alice, SocketEvent.SceneUpdate, {
      sessionId: 'ROOM',
      playerId: 'alice',
      sceneId: 'default',
      gridCells: 10,
    });
    // And a drag of it is relayed to nobody.
    alice.emit(SocketEvent.DiceMove, {
      sessionId: 'ROOM',
      playerId: 'alice',
      diceId: 'secret',
      position: { x: 0.3, y: 0.78, z: 0.3 },
    });
    await settle();

    expect(bobSees.state.dice ?? []).toEqual([]);
    expect(bobSees.state.log.some((entry) => entry.kind === 'roll')).toBe(false);
    // Not even the id, anywhere in anything Bob's socket received.
    expect(bobSees.raw.some((message) => message.includes('"secret"'))).toBe(false);

    // A late joiner doesn't get it either; nor can Bob roll it by guessing its id.
    const carol = await connect();
    const carolJoined = await join(carol, 'carol');
    expect(carolJoined.ok && carolJoined.state.dice).toEqual([]);
    expect(await roll(bob, 'bob', ['secret'])).toEqual({ ok: false, error: 'Die not found.' });
  });

  it('a mixed roll: an open line for everyone, a secret line for the host', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    const bobSees = follow(bob);
    await spawn(alice, 'alice', 'open', false);
    await spawn(alice, 'alice', 'hidden', true);
    const rolled = await roll(alice, 'alice', ['open', 'hidden']);
    const aliceRolls = rolled.ok ? rolled.state.log.filter((entry) => entry.kind === 'roll') : [];
    expect(aliceRolls).toHaveLength(2);
    await settle();
    const bobRolls = bobSees.state.log.filter((entry) => entry.kind === 'roll');
    expect(bobRolls).toHaveLength(1);
    expect(bobRolls[0]).not.toHaveProperty('visibleTo');
  });

  it('a secret die goes when its owner leaves', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    store.spawnDice('ROOM', 'alice', 'h', { x: 0, y: 0.78, z: 0 }, 'd20', true);
    store.spawnDice('ROOM', 'alice', 'o', { x: 0, y: 0.78, z: 0 }, 'd6', false);
    store.leave('ROOM', 'alice');
    expect(store.get('ROOM')!.dice.map((die) => die.id)).toEqual(['o']);
  });
});

describe('viewFor', () => {
  it('passes a state with nothing private through untouched', () => {
    const store = new SessionStore();
    const state = store.join('ROOM', 'alice', 'Alice');
    expect(viewFor(state, 'bob')).toBe(state);
  });
});
