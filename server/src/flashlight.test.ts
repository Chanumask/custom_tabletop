import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type ItemTakeResponse,
  type FlashlightToggleResponse,
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

function toggleAck(client: ClientSocket, payload: unknown): Promise<FlashlightToggleResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.FlashlightToggle, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('The flashlight (gadgets phase 3 exit check)', () => {
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

  it('rejects a toggle from a player not holding the flashlight', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'flash-1', playerId: 'alice-id', playerName: 'Alice' });

    const result = await toggleAck(alice, { sessionId: 'flash-1', playerId: 'alice-id' });
    expect(result).toEqual({ ok: false, error: 'You need the flashlight.' });
  });

  it('toggling it on is seen live by another player', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'flash-2', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'flash-2', playerId: 'bob-id', playerName: 'Bob' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await takeAck(bob, { sessionId: 'flash-2', playerId: 'bob-id', itemId: 'flashlight-1' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesItTurnOn = nextUpdate(alice);
    const result = await toggleAck(bob, { sessionId: 'flash-2', playerId: 'bob-id' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.find((p) => p.id === 'bob-id')?.flashlightOn).toBe(true);

    const broadcast = (await aliceSeesItTurnOn) as {
      players: { id: string; flashlightOn: boolean }[];
    };
    expect(broadcast.players.find((p) => p.id === 'bob-id')?.flashlightOn).toBe(true);
  });

  it('rejects a malformed payload without crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'flash-3', playerId: 'alice-id', playerName: 'Alice' });

    const malformed = await toggleAck(alice, { sessionId: 'flash-3' });
    expect(malformed.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    await takeAck(alice, { sessionId: 'flash-3', playerId: 'alice-id', itemId: 'flashlight-1' });
    const followUp = await toggleAck(alice, { sessionId: 'flash-3', playerId: 'alice-id' });
    expect(followUp.ok).toBe(true);
  });
});
