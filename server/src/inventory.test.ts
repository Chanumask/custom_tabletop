import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type ItemTakeResponse,
  type ItemDropResponse,
} from '@custom-tabletop/shared';
import { withTestToken, nextUpdate } from './testSupport.js';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) =>
    client.emit(SocketEvent.SessionJoin, withTestToken(payload), resolve),
  );
}

function takeAck(client: ClientSocket, payload: unknown): Promise<ItemTakeResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.ItemTake, payload, resolve));
}

function dropAck(client: ClientSocket, payload: unknown): Promise<ItemDropResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.ItemDrop, payload, resolve));
}

function leaveAck(client: ClientSocket, payload: unknown): Promise<SessionLeaveResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionLeave, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('The room chest (gadgets phase 1 exit check)', () => {
  let app: AppServer;
  let url: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    app = createAppServer();
    await new Promise<void>((resolve) => {
      app.http.listen(0, () => resolve());
    });
    const address = app.http.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind to a numeric port');
    }
    url = `http://localhost:${address.port}`;
    clients = [];
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    app.io.close();
    await new Promise<void>((resolve) => app.http.close(() => resolve()));
  });

  it('a fresh session starts with the whole catalog in the chest', async () => {
    const alice = await connect(url);
    clients.push(alice);
    const joined = await joinAck(alice, {
      sessionId: 'chest-1',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.state.inventory).toHaveLength(5);
    expect(joined.state.inventory.every((item) => item.heldBy === null)).toBe(true);
  });

  it('one player taking an item is seen live by another player, and can be dropped again', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'chest-2', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'chest-2', playerId: 'bob-id', playerName: 'Bob' });
    // Drain Bob's own join broadcast before listening for the next one —
    // same pattern used elsewhere in this suite (see interactables.test.ts).
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesBobTakeIt = nextUpdate(alice);

    const takeResult = await takeAck(bob, {
      sessionId: 'chest-2',
      playerId: 'bob-id',
      itemId: 'calculator-1',
    });
    expect(takeResult.ok).toBe(true);
    if (!takeResult.ok) return;
    expect(takeResult.state.inventory.find((item) => item.id === 'calculator-1')?.heldBy).toBe(
      'bob-id',
    );

    const broadcast = (await aliceSeesBobTakeIt) as {
      inventory: { id: string; heldBy: string | null }[];
    };
    expect(broadcast.inventory.find((item) => item.id === 'calculator-1')?.heldBy).toBe('bob-id');

    const dropResult = await dropAck(bob, {
      sessionId: 'chest-2',
      playerId: 'bob-id',
      itemId: 'calculator-1',
    });
    expect(dropResult.ok).toBe(true);
    if (!dropResult.ok) return;
    expect(dropResult.state.inventory.find((item) => item.id === 'calculator-1')?.heldBy).toBe(
      null,
    );
  });

  it('rejects a forged take of an item someone else is already holding, with no effect', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'chest-3', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'chest-3', playerId: 'bob-id', playerName: 'Bob' });

    const aliceTook = await takeAck(alice, {
      sessionId: 'chest-3',
      playerId: 'alice-id',
      itemId: 'walkie-1',
    });
    expect(aliceTook.ok).toBe(true);

    const bobForgedTake = await takeAck(bob, {
      sessionId: 'chest-3',
      playerId: 'bob-id',
      itemId: 'walkie-1',
    });
    expect(bobForgedTake).toEqual({ ok: false, error: 'Someone else is already holding that.' });

    // Bob trying to drop an item he never held is rejected too — dropping
    // isn't a free-for-all just because taking failed.
    const bobForgedDrop = await dropAck(bob, {
      sessionId: 'chest-3',
      playerId: 'bob-id',
      itemId: 'walkie-1',
    });
    expect(bobForgedDrop).toEqual({ ok: false, error: "You aren't holding that." });

    // Alice still holds it — neither forged request had any effect.
    const stillAlices = await takeAck(alice, {
      sessionId: 'chest-3',
      playerId: 'alice-id',
      itemId: 'walkie-1',
    });
    expect(stillAlices.ok).toBe(true);
  });

  it('a player who leaves drops their held item back into the chest, visible to whoever remains', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'chest-4', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'chest-4', playerId: 'bob-id', playerName: 'Bob' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await takeAck(bob, { sessionId: 'chest-4', playerId: 'bob-id', itemId: 'flashlight-1' });
    // Drain the take's own broadcast to Alice before listening for the next
    // one — same reason the post-join drain above exists (see
    // interactables.test.ts): nextUpdate resolves on the first update it
    // sees, and the take's broadcast to Alice races the leave that follows.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesBobLeave = nextUpdate(alice);
    await leaveAck(bob, { sessionId: 'chest-4', playerId: 'bob-id' });
    const broadcast = (await aliceSeesBobLeave) as {
      inventory: { id: string; heldBy: string | null }[];
    };
    expect(broadcast.inventory.find((item) => item.id === 'flashlight-1')?.heldBy).toBeNull();
  });

  it('rejects a malformed payload without crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'chest-5', playerId: 'alice-id', playerName: 'Alice' });

    const malformed = await takeAck(alice, { sessionId: 'chest-5', playerId: 'alice-id' });
    expect(malformed.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await takeAck(alice, {
      sessionId: 'chest-5',
      playerId: 'alice-id',
      itemId: 'camera-1',
    });
    expect(followUp.ok).toBe(true);
  });
});
