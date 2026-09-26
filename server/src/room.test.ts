import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  DEFAULT_ROOM_STATE,
  MAX_BOOKS,
  SocketEvent,
  SOUNDS_OFF_ERROR,
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

describe('the sofa and the chairs away from the table', () => {
  function room() {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    return store;
  }
  const lounge = (store: SessionStore, id: string) =>
    store.get('ROOM')!.players.find((player) => player.id === id)!.lounge;

  it('seat one player each', () => {
    const store = room();
    expect(store.setLounge('ROOM', 'alice', 'sofa-middle').ok).toBe(true);
    expect(store.setLounge('ROOM', 'bob', 'sofa-middle')).toEqual({
      ok: false,
      error: 'Alice is already sitting there.',
    });
    expect(store.setLounge('ROOM', 'bob', 'sofa-east').ok).toBe(true);
    // Moving over to another free seat is fine, and frees the old one.
    expect(store.setLounge('ROOM', 'alice', 'rocking-chair').ok).toBe(true);
    expect(lounge(store, 'alice')).toBe('rocking-chair');
    expect(store.setLounge('ROOM', 'bob', 'sofa-middle').ok).toBe(true);
    store.setLounge('ROOM', 'alice', undefined, false);
    expect(lounge(store, 'alice')).toBeNull();
    expect(store.setLounge('ROOM', 'alice', 'hammock').ok).toBe(false);
  });

  it('and the table are one or the other', () => {
    const store = room();
    store.setLounge('ROOM', 'alice', 'armchair');
    store.setSeated('ROOM', 'alice', true, 0);
    expect(lounge(store, 'alice')).toBeNull();
    store.setLounge('ROOM', 'alice', 'armchair');
    const alice = store.get('ROOM')!.players.find((player) => player.id === 'alice')!;
    expect(alice).toMatchObject({ seated: false, seatIndex: null, lounge: 'armchair' });
  });

  it('free up when someone leaves, and come back sensibly with a saved table', () => {
    const store = room();
    store.setLounge('ROOM', 'alice', 'armchair');
    store.leave('ROOM', 'alice');
    expect(store.setLounge('ROOM', 'bob', 'armchair').ok).toBe(true);
    const saved = structuredClone(store.get('ROOM')!);
    const restored = store.restore({
      sessionId: 'SAVED',
      hostKey: 'key',
      credentialHashes: {},
      state: saved,
    });
    expect(restored.players[0]!.lounge).toBe('armchair');
    const odd = structuredClone(saved);
    odd.players[0]!.lounge = 'hammock' as never;
    delete (odd.players[1] as Partial<(typeof odd.players)[number]> | undefined)?.lounge;
    const fromOdd = store.restore({
      sessionId: 'ODD',
      hostKey: 'key',
      credentialHashes: {},
      state: odd,
    });
    expect(fromOdd.players.map((player) => player.lounge)).toEqual(odd.players.map(() => null));
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
    const sat = await interact(alice, 'alice', { objectId: 'lounge', target: 'rocking-chair' });
    expect(sat.ok).toBe(true);
    const taken = await interact(bob, 'bob', { objectId: 'lounge', target: 'rocking-chair' });
    expect(taken).toMatchObject({ ok: false, error: 'alice is already sitting there.' });
    await settle();
    expect(bobSees.players.find((player) => player.id === 'alice')?.lounge).toBe('rocking-chair');
    const up = await interact(alice, 'alice', {
      objectId: 'lounge',
      target: 'rocking-chair',
      on: false,
    });
    expect(up.state?.players.find((player) => player.id === 'alice')?.lounge).toBeNull();
  });
});

describe('the record player', () => {
  function room() {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.addSound('ROOM', 'song-1', 'Our Theme', 'http://localhost/uploads/sounds/theme.mp3');
    store.addSound('ROOM', 'clip-1', 'A Video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    return store;
  }

  it('puts a record on for everyone, from the top, and says so', () => {
    const store = room();
    const put = store.setRecord('ROOM', 'alice', 'rain-jazz', true, 5000);
    expect(put.ok && put.state.room.record).toEqual({ record: 'rain-jazz', startedAt: 5000 });
    expect(store.get('ROOM')!.log.at(-1)).toMatchObject({ text: 'Alice put on Rain Jazz' });
    // The same record again starts it over.
    store.setRecord('ROOM', 'alice', 'rain-jazz', true, 9000);
    expect(store.get('ROOM')!.room.record?.startedAt).toBe(9000);
    store.setRecord('ROOM', 'alice', undefined, false);
    expect(store.get('ROOM')!.room.record).toBeNull();
    expect(store.get('ROOM')!.log.at(-1)).toMatchObject({ text: 'Alice took the record off' });
    // Taking off nothing says nothing.
    const entries = store.get('ROOM')!.log.length;
    store.setRecord('ROOM', 'alice', undefined, false);
    expect(store.get('ROOM')!.log.length).toBe(entries);
  });

  it('plays a soundboard sound that is an audio file, and nothing else', () => {
    const store = room();
    expect(store.setRecord('ROOM', 'alice', 'sound:song-1').ok).toBe(true);
    expect(store.get('ROOM')!.log.at(-1)).toMatchObject({ text: 'Alice put on “Our Theme”' });
    expect(store.setRecord('ROOM', 'alice', 'sound:clip-1').ok).toBe(false);
    expect(store.setRecord('ROOM', 'alice', 'sound:nope').ok).toBe(false);
    expect(store.setRecord('ROOM', 'alice', 'polka').ok).toBe(false);
    expect(store.setRecord('ROOM', 'alice', undefined).ok).toBe(false);
  });

  it('is everyone’s over the socket — unless the host turned sounds off', async () => {
    const alice = await connect();
    const bob = await connect();
    await join(alice, 'alice');
    await join(bob, 'bob');
    let bobSees = {} as GameState;
    onStateUpdates(bob, (state) => {
      bobSees = state;
    });
    const put = await interact(bob, 'bob', { objectId: 'record', target: 'lofi' });
    expect(put.ok).toBe(true);
    await settle();
    expect(bobSees.room.record?.record).toBe('lofi');
    expect(bobSees.log.at(-1)).toMatchObject({ text: 'bob put on Lo-fi Evening' });
    await emitAck(alice, SocketEvent.HostAction, {
      sessionId: 'ROOM',
      playerId: 'alice',
      action: 'permission',
      permission: 'sounds',
      allowed: false,
    });
    const refused = await interact(bob, 'bob', { objectId: 'record', on: false });
    expect(refused).toMatchObject({ ok: false, error: SOUNDS_OFF_ERROR });
    // The host still can.
    const off = await interact(alice, 'alice', { objectId: 'record', on: false });
    expect(off.state?.room.record).toBeNull();
  });
});

describe('tea, cocoa and popcorn', () => {
  function room() {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    return store;
  }
  const alice = (store: SessionStore) =>
    store.get('ROOM')!.players.find((player) => player.id === 'alice')!;

  it('pours a drink into a free hand — a gadget goes back in the chest', () => {
    const store = room();
    store.takeItem('ROOM', 'alice', 'flashlight-1');
    store.toggleFlashlight?.('ROOM', 'alice');
    expect(store.setDrink('ROOM', 'alice', 'cocoa').ok).toBe(true);
    expect(alice(store).carrying).toBe('cocoa');
    expect(store.get('ROOM')!.inventory.every((item) => item.heldBy === null)).toBe(true);
    expect(alice(store).flashlightOn).toBe(false);
    // Taking a gadget sets the drink down again.
    store.takeItem('ROOM', 'alice', 'camera-1');
    expect(alice(store).carrying).toBeNull();
    store.setDrink('ROOM', 'alice', 'tea');
    store.setDrink('ROOM', 'alice', undefined, false);
    expect(alice(store).carrying).toBeNull();
    expect(store.setDrink('ROOM', 'alice', 'coffee').ok).toBe(false);
  });

  it('come back sensibly with a saved table', () => {
    const store = room();
    store.setDrink('ROOM', 'alice', 'tea');
    const saved = structuredClone(store.get('ROOM')!);
    expect(
      store.restore({ sessionId: 'S1', hostKey: 'k', credentialHashes: {}, state: saved })
        .players[0]!.carrying,
    ).toBe('tea');
    const odd = structuredClone(saved);
    odd.players[0]!.carrying = 'grog' as never;
    expect(
      store.restore({ sessionId: 'S2', hostKey: 'k', credentialHashes: {}, state: odd }).players[0]!
        .carrying,
    ).toBeNull();
  });

  it('relays sips and toasts (with a drink in hand) and snacks to everyone else', async () => {
    const aliceSocket = await connect();
    const bobSocket = await connect();
    await join(aliceSocket, 'alice');
    await join(bobSocket, 'bob');
    const seen: unknown[] = [];
    bobSocket.on(SocketEvent.PlayerGesture, (request) => seen.push(request));
    const gesture = (name: string) =>
      aliceSocket.emit(SocketEvent.PlayerGesture, {
        sessionId: 'ROOM',
        playerId: 'alice',
        gesture: name,
      });
    gesture('cheers'); // no drink yet: nothing
    await settle();
    expect(seen).toEqual([]);
    await interact(aliceSocket, 'alice', { objectId: 'teaset', target: 'tea' });
    gesture('cheers');
    await new Promise((resolve) => setTimeout(resolve, 450));
    gesture('snack');
    await new Promise((resolve) => setTimeout(resolve, 450));
    gesture('pet');
    await new Promise((resolve) => setTimeout(resolve, 450));
    gesture('juggle');
    await settle();
    expect(seen).toEqual([
      { sessionId: 'ROOM', playerId: 'alice', gesture: 'cheers' },
      { sessionId: 'ROOM', playerId: 'alice', gesture: 'snack' },
      { sessionId: 'ROOM', playerId: 'alice', gesture: 'pet' },
    ]);
  });
});

describe('the books on the lectern', () => {
  function room() {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    return store;
  }

  it('are the host’s to write, rewrite and take away, and everyone hears of a new one', () => {
    const store = room();
    expect(store.writeBook('ROOM', 'bob', { title: 'Mine', text: '', cover: 0 }).ok).toBe(false);
    const written = store.writeBook('ROOM', 'alice', {
      title: 'Lore',
      text: 'Once upon',
      cover: 2,
    });
    expect(written.ok).toBe(true);
    const book = store.get('ROOM')!.books[0]!;
    expect(book).toMatchObject({ title: 'Lore', text: 'Once upon', cover: 2 });
    expect(store.get('ROOM')!.log.at(-1)).toMatchObject({
      text: 'Alice left a new book by the bookshelf: “Lore”',
    });
    const entries = store.get('ROOM')!.log.length;
    store.writeBook('ROOM', 'alice', {
      bookId: book.id,
      title: 'Lore, revised',
      text: 'Twice',
      cover: 1,
    });
    expect(store.get('ROOM')!.books).toEqual([
      { id: book.id, title: 'Lore, revised', text: 'Twice', cover: 1 },
    ]);
    expect(store.get('ROOM')!.log.length).toBe(entries);
    expect(
      store.writeBook('ROOM', 'alice', { bookId: 'gone', title: 'x', text: '', cover: 0 }).ok,
    ).toBe(false);
    expect(store.removeBook('ROOM', 'bob', book.id).ok).toBe(false);
    expect(store.removeBook('ROOM', 'alice', book.id).ok).toBe(true);
    expect(store.get('ROOM')!.books).toEqual([]);
  });

  it('fit a dozen on the lectern', () => {
    const store = room();
    for (let i = 0; i < MAX_BOOKS; i++) {
      expect(store.writeBook('ROOM', 'alice', { title: `Book ${i}`, text: '', cover: 0 }).ok).toBe(
        true,
      );
    }
    expect(store.writeBook('ROOM', 'alice', { title: 'One too many', text: '', cover: 0 }).ok).toBe(
      false,
    );
  });

  it('come back with a saved table', () => {
    const store = room();
    store.writeBook('ROOM', 'alice', { title: 'Kept', text: 'Safe', cover: 3 });
    const saved = structuredClone(store.get('ROOM')!) as Partial<GameState>;
    const restored = store.restore({
      sessionId: 'S',
      hostKey: 'k',
      credentialHashes: {},
      state: saved as GameState,
    });
    expect(restored.books).toMatchObject([{ title: 'Kept', text: 'Safe', cover: 3 }]);
    delete saved.books;
    const older = store.restore({
      sessionId: 'T',
      hostKey: 'k',
      credentialHashes: {},
      state: saved as GameState,
    });
    expect(older.books).toEqual([]);
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
    const written = await emitAck(alice, SocketEvent.HostAction, {
      sessionId: 'ROOM',
      playerId: 'alice',
      action: 'writeBook',
      title: 'Letter',
      text: 'Dear all',
      cover: 4,
    });
    expect(written.ok).toBe(true);
    await settle();
    expect(bobSees.books).toMatchObject([{ title: 'Letter', text: 'Dear all', cover: 4 }]);
    const refused = await emitAck(bob, SocketEvent.HostAction, {
      sessionId: 'ROOM',
      playerId: 'bob',
      action: 'removeBook',
      bookId: bobSees.books[0]!.id,
    });
    expect(refused.ok).toBe(false);
    const empty = await emitAck(alice, SocketEvent.HostAction, {
      sessionId: 'ROOM',
      playerId: 'alice',
      action: 'writeBook',
      title: '   ',
      text: 'no title',
      cover: 0,
    });
    expect(empty.ok).toBe(false);
  });
});
