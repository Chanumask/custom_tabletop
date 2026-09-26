import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { SocketEvent, type GameState } from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';
import { onStateUpdates } from './testSupport.js';

// The room's shared switches (docs/decisions.md, "The cozy room").

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

type Ack = { ok: boolean; error?: string; state?: GameState };
const emitAck = (client: ClientSocket, event: string, payload: unknown): Promise<Ack> =>
  new Promise((resolve) => client.emit(event, payload, resolve));

const join = (client: ClientSocket, playerId: string) =>
  emitAck(client, SocketEvent.SessionJoin, {
    sessionId: 'ROOM',
    playerId,
    playerName: playerId,
    playerToken: `token-${playerId}`,
  });

const interact = (client: ClientSocket, playerId: string, fields: Record<string, unknown>) =>
  emitAck(client, SocketEvent.ObjectInteract, { sessionId: 'ROOM', playerId, ...fields });

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('the reading lamp', () => {
  it('has its own switch, apart from the room light, seen by everyone', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    let bobSees = {} as GameState;
    onStateUpdates(bob, (state) => {
      bobSees = state;
    });

    const off = await interact(alice, 'alice', { objectId: 'lamp', on: false });
    expect(off.ok).toBe(true);
    expect(off.state?.room.readingLampOn).toBe(false);
    expect(off.state?.lightOn).toBe(true);
    await settle();
    expect(bobSees.room.readingLampOn).toBe(false);

    // No `on`: the other way round. The room light is still its own switch.
    const toggled = await interact(bob, 'bob', { objectId: 'lamp' });
    expect(toggled.state?.room.readingLampOn).toBe(true);
    const light = await interact(bob, 'bob', { objectId: 'light' });
    expect(light.state?.lightOn).toBe(false);
    expect(light.state?.room.readingLampOn).toBe(true);
  });

  it('refuses a switch position that is not a yes or no', async () => {
    const alice = await connect();
    await join(alice, 'alice');
    const bad = await interact(alice, 'alice', { objectId: 'lamp', on: 'dim' });
    expect(bad.ok).toBe(false);
  });
});

describe('a saved table from before the room had its own switches', () => {
  it('reopens with the lamp on', () => {
    const store = new SessionStore();
    const state = store.join('OLD', 'alice', 'Alice');
    const older: Partial<GameState> = structuredClone(state);
    delete older.room;
    const restored = store.restore({
      sessionId: 'OLDER',
      hostKey: 'key',
      credentialHashes: {},
      state: older as GameState,
    });
    expect(restored.room).toEqual({ readingLampOn: true });
  });
});
