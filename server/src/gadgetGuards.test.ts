import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  MAX_LOG_ENTRIES,
  MAX_RADIO_ENTRIES,
  SocketEvent,
  type GameState,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';
import { parsePhotoCaptureRequest } from './validation.js';
import { onStateUpdates } from './testSupport.js';

// The gadgets review (docs/decisions.md, "Gadgets review"): every gadget
// reply is filtered like the rest, a put-back flashlight goes dark for
// everyone, and the walkies/camera can't be used to flood a table.

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

const take = (client: ClientSocket, playerId: string, itemId: string) =>
  emitAck(client, SocketEvent.ItemTake, { sessionId: 'ROOM', playerId, itemId });

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

/** Alice hosts (and has a secret die out); Bob is a player. */
async function table() {
  const alice = await connect();
  const bob = await connect();
  await join(alice, 'alice');
  await join(bob, 'bob');
  const spawned = await emitAck(alice, SocketEvent.DiceSpawn, {
    sessionId: 'ROOM',
    playerId: 'alice',
    diceId: 'secret',
    position: { x: 0, y: 0.78, z: 0 },
    kind: 'd20',
    hidden: true,
  });
  expect(spawned.ok).toBe(true);
  await settle();
  return { alice, bob };
}

describe('gadget replies are filtered for the one asking', () => {
  it("take, drop, flashlight and photo replies never carry the host's secret die", async () => {
    const { bob } = await table();
    const replies: Ack[] = [];
    replies.push(await take(bob, 'bob', 'flashlight-1'));
    replies.push(
      await emitAck(bob, SocketEvent.FlashlightToggle, { sessionId: 'ROOM', playerId: 'bob' }),
    );
    replies.push(await take(bob, 'bob', 'camera-1'));
    replies.push(
      await emitAck(bob, SocketEvent.PhotoCapture, {
        sessionId: 'ROOM',
        playerId: 'bob',
        url: 'http://localhost/uploads/images/p.jpg',
      }),
    );
    replies.push(
      await emitAck(bob, SocketEvent.ItemDrop, {
        sessionId: 'ROOM',
        playerId: 'bob',
        itemId: 'camera-1',
      }),
    );
    expect(replies.every((reply) => reply.ok)).toBe(true);
    for (const reply of replies) {
      expect(reply.state?.dice.map((die) => die.id)).toEqual([]);
      expect(JSON.stringify(reply)).not.toContain('"secret"');
    }
  });
});

describe('the flashlight', () => {
  it('swapping it back into the chest switches it off for everyone', async () => {
    const { alice, bob } = await table();
    let aliceSees = {} as GameState;
    onStateUpdates(alice, (state) => {
      aliceSees = state;
    });
    await take(bob, 'bob', 'flashlight-1');
    await emitAck(bob, SocketEvent.FlashlightToggle, { sessionId: 'ROOM', playerId: 'bob' });
    await settle();
    expect(aliceSees.players.find((p) => p.id === 'bob')?.flashlightOn).toBe(true);

    await take(bob, 'bob', 'camera-1');
    await settle();
    expect(aliceSees.players.find((p) => p.id === 'bob')?.flashlightOn).toBe(false);
  });

  it('putting it back switches it off for everyone', async () => {
    const { alice, bob } = await table();
    let aliceSees = {} as GameState;
    onStateUpdates(alice, (state) => {
      aliceSees = state;
    });
    await take(bob, 'bob', 'flashlight-1');
    await emitAck(bob, SocketEvent.FlashlightToggle, { sessionId: 'ROOM', playerId: 'bob' });
    await settle();
    await emitAck(bob, SocketEvent.ItemDrop, {
      sessionId: 'ROOM',
      playerId: 'bob',
      itemId: 'flashlight-1',
    });
    await settle();
    expect(aliceSees.players.find((p) => p.id === 'bob')?.flashlightOn).toBe(false);
  });
});

describe('the walkie-talkies', () => {
  it('share the chat flood guard', async () => {
    const { alice, bob } = await table();
    await take(alice, 'alice', 'walkie-1');
    await take(bob, 'bob', 'walkie-2');
    const results: Ack[] = [];
    for (let i = 0; i < 8; i += 1) {
      results.push(
        await emitAck(bob, SocketEvent.WalkieTransmit, {
          sessionId: 'ROOM',
          playerId: 'bob',
          text: `over ${i}`,
        }),
      );
    }
    expect(results.filter((result) => result.ok)).toHaveLength(6);
    expect(results.at(-1)).toEqual({ ok: false, error: 'Easy there — too many messages at once.' });
  });
});

describe('the camera', () => {
  it('pins at most one photo per player every couple of seconds', async () => {
    const { bob } = await table();
    await take(bob, 'bob', 'camera-1');
    const shoot = (name: string) =>
      emitAck(bob, SocketEvent.PhotoCapture, {
        sessionId: 'ROOM',
        playerId: 'bob',
        url: `http://localhost/uploads/images/${name}.jpg`,
      });
    expect((await shoot('one')).ok).toBe(true);
    expect(await shoot('two')).toEqual({ ok: false, error: 'Easy there — one photo at a time.' });
  });

  it("accepts only this server's own image uploads, keeping just the path", () => {
    const request = (photoUrl: string) =>
      parsePhotoCaptureRequest({ sessionId: 'ROOM', playerId: 'bob', url: photoUrl });
    expect(request('https://tabletop.murri.me/uploads/images/abc-1.jpg')?.url).toBe(
      '/uploads/images/abc-1.jpg',
    );
    // Any host is fine: only the path is kept, so it always loads from us.
    expect(request('https://elsewhere.example/uploads/images/abc.jpg')?.url).toBe(
      '/uploads/images/abc.jpg',
    );
    expect(request('https://elsewhere.example/cat.jpg')).toBeNull();
    expect(request('https://tabletop.murri.me/uploads/sounds/abc.mp3')).toBeNull();
    expect(request('https://tabletop.murri.me/uploads/images/a/b.jpg')).toBeNull();
    expect(request('https://tabletop.murri.me/uploads/images/%2e%2e')).toBeNull();
    expect(request('javascript:alert(1)')).toBeNull();
  });

  it('the host can take every photo down; a player cannot', () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    store.takeItem('ROOM', 'bob', 'camera-1');
    store.capturePhoto('ROOM', 'bob', '/uploads/images/one.jpg');
    expect(store.get('ROOM')!.photos).toHaveLength(1);

    expect(store.clearTable('ROOM', 'bob', 'photos').ok).toBe(false);
    expect(store.clearTable('ROOM', 'alice', 'photos').ok).toBe(true);
    expect(store.get('ROOM')!.photos).toEqual([]);
    const last = store.get('ROOM')!.log.at(-1);
    expect(last && 'text' in last && last.text).toBe('Alice took the photos off the pinboard');
  });
});

describe('the radio log', () => {
  it("walkie lines are capped on their own and never push the table's log out", () => {
    const store = new SessionStore();
    store.join('ROOM', 'alice', 'Alice');
    store.join('ROOM', 'bob', 'Bob');
    store.takeItem('ROOM', 'alice', 'walkie-1');
    store.takeItem('ROOM', 'bob', 'walkie-2');
    const before = store.get('ROOM')!.log.filter((entry) => entry.kind !== 'radio').length;
    for (let i = 0; i < MAX_RADIO_ENTRIES + 40; i += 1) {
      store.transmitOnWalkie('ROOM', 'bob', `over ${i}`);
    }
    const log = store.get('ROOM')!.log;
    const radio = log.filter((entry) => entry.kind === 'radio');
    expect(radio).toHaveLength(MAX_RADIO_ENTRIES);
    expect(radio.at(-1)).toMatchObject({ text: `over ${MAX_RADIO_ENTRIES + 39}` });
    expect(log.filter((entry) => entry.kind !== 'radio')).toHaveLength(before);
    expect(log.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES + MAX_RADIO_ENTRIES);
  });
});
