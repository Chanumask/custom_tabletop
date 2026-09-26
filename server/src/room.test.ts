import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  DEFAULT_ROOM_STATE,
  SocketEvent,
  STOKE_MIN_INTERVAL_MS,
  type GameState,
} from '@custom-tabletop/shared';
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
    expect(restored.room).toEqual(DEFAULT_ROOM_STATE);
  });
});

describe('the fire and the candles', () => {
  it('a log on the fire is seen by everyone, and one at a time', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    const first = store.stokeFire('ROOM', 1000);
    expect(first.ok && first.state.room.fireStokedAt).toBe(1000);
    store.stokeFire('ROOM', 1000 + STOKE_MIN_INTERVAL_MS - 1);
    expect(store.get('ROOM')!.room.fireStokedAt).toBe(1000);
    store.stokeFire('ROOM', 1000 + STOKE_MIN_INTERVAL_MS);
    expect(store.get('ROOM')!.room.fireStokedAt).toBe(1000 + STOKE_MIN_INTERVAL_MS);
  });

  it('blows out and lights candle groups, and knows only the real ones', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.setCandles('ROOM', 'mantel-north', false);
    store.setCandles('ROOM', 'oil-lamp');
    expect(store.get('ROOM')!.room.candlesOut).toEqual(['mantel-north', 'oil-lamp']);
    // Blowing out one that is already out changes nothing.
    store.setCandles('ROOM', 'mantel-north', false);
    expect(store.get('ROOM')!.room.candlesOut).toEqual(['mantel-north', 'oil-lamp']);
    store.setCandles('ROOM', 'oil-lamp');
    store.setCandles('ROOM', 'mantel-north', true);
    expect(store.get('ROOM')!.room.candlesOut).toEqual([]);
    expect(store.setCandles('ROOM', 'the-moon', false).ok).toBe(false);
    expect(store.setCandles('ROOM', undefined).ok).toBe(false);
  });

  it('reach everyone over the socket', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    let bobSees = {} as GameState;
    onStateUpdates(bob, (state) => {
      bobSees = state;
    });
    const out = await interact(alice, 'alice', {
      objectId: 'candles',
      target: 'sconce-east',
      on: false,
    });
    expect(out.ok).toBe(true);
    const stoked = await interact(alice, 'alice', { objectId: 'hearth' });
    expect(stoked.state?.room.fireStokedAt).toEqual(expect.any(Number));
    await settle();
    expect(bobSees.room.candlesOut).toEqual(['sconce-east']);
    expect(bobSees.room.fireStokedAt).toBe(stoked.state?.room.fireStokedAt);
  });
});

describe('the windows', () => {
  it('open and shut, and draw their curtains, one window at a time', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.setWindow('ROOM', 'east-1', true);
    store.setCurtains('ROOM', 'north');
    const room = store.get('ROOM')!.room;
    expect(room.windows['east-1']).toEqual({ open: true, drawn: false });
    expect(room.windows.north).toEqual({ open: false, drawn: true });
    expect(room.windows['west-2']).toEqual({ open: false, drawn: false });
    // No `on`: the other way round.
    store.setWindow('ROOM', 'east-1');
    expect(store.get('ROOM')!.room.windows['east-1'].open).toBe(false);
    expect(store.setWindow('ROOM', 'skylight', true).ok).toBe(false);
    expect(store.setCurtains('ROOM', undefined).ok).toBe(false);
  });

  it('reach everyone over the socket', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    let bobSees = {} as GameState;
    onStateUpdates(bob, (state) => {
      bobSees = state;
    });
    const opened = await interact(bob, 'bob', { objectId: 'window', target: 'west-1', on: true });
    expect(opened.ok).toBe(true);
    const drawn = await interact(alice, 'alice', { objectId: 'curtains', target: 'west-1' });
    expect(drawn.state?.room.windows['west-1']).toEqual({ open: true, drawn: true });
    await settle();
    expect(bobSees.room.windows['west-1']).toEqual({ open: true, drawn: true });
  });
});

describe('the weather', () => {
  const host = (client: ClientSocket, playerId: string, weather: unknown) =>
    emitAck(client, SocketEvent.HostAction, {
      sessionId: 'ROOM',
      playerId,
      action: 'weather',
      weather,
    });

  it("is the host's to change, and everyone sees it and reads it in the log", async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    let bobSees = {} as GameState;
    onStateUpdates(bob, (state) => {
      bobSees = state;
    });
    const refused = await host(bob, 'bob', 'storm');
    expect(refused.ok).toBe(false);
    const storm = await host(alice, 'alice', 'storm');
    expect(storm.ok).toBe(true);
    expect(storm.state?.room.weather).toBe('storm');
    await settle();
    expect(bobSees.room.weather).toBe('storm');
    expect(bobSees.log.at(-1)).toMatchObject({ kind: 'system', text: 'alice called up a storm' });
    expect((await host(alice, 'alice', 'hail')).ok).toBe(false);
  });

  it('says nothing in the log when it stays the same', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.setWeather('ROOM', 'alice', 'snow');
    const entries = store.get('ROOM')!.log.length;
    store.setWeather('ROOM', 'alice', 'snow');
    expect(store.get('ROOM')!.log.length).toBe(entries);
    expect(store.get('ROOM')!.log.at(-1)).toMatchObject({ text: 'Alice let it snow' });
  });
});
