import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { SocketEvent, type SessionJoinResponse } from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionJoin, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('player:move (Milestone 4 exit check)', () => {
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

  it("one player's move is seen live by another player in the same session, but not echoed back to the mover", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'table-1', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-1', playerId: 'bob-id', playerName: 'Bob' });

    const bobSeesAliceMove = new Promise((resolve) => bob.once(SocketEvent.PlayerMove, resolve));
    const aliceEchoCheck = new Promise((resolve) => {
      alice.once(SocketEvent.PlayerMove, () => resolve('echoed'));
      setTimeout(() => resolve('no echo'), 100);
    });

    alice.emit(SocketEvent.PlayerMove, {
      sessionId: 'table-1',
      playerId: 'alice-id',
      position: { x: 1.5, y: 1.7, z: -2 },
      rotationY: 0.75,
    });

    expect(await bobSeesAliceMove).toEqual({
      sessionId: 'table-1',
      playerId: 'alice-id',
      position: { x: 1.5, y: 1.7, z: -2 },
      rotationY: 0.75,
    });
    expect(await aliceEchoCheck).toBe('no echo');
  });

  it('a later joiner sees the moved position in their initial session state', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-2', playerId: 'alice-id', playerName: 'Alice' });

    alice.emit(SocketEvent.PlayerMove, {
      sessionId: 'table-2',
      playerId: 'alice-id',
      position: { x: 3, y: 1.7, z: 1 },
      rotationY: 2,
    });
    // No ack for player:move — give the server a tick to apply it before Bob joins.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const bob = await connect(url);
    clients.push(bob);
    const bobJoined = await joinAck(bob, {
      sessionId: 'table-2',
      playerId: 'bob-id',
      playerName: 'Bob',
    });

    expect(bobJoined.ok).toBe(true);
    if (!bobJoined.ok) return;
    const aliceAsSeenByBob = bobJoined.state.players.find((p) => p.id === 'alice-id');
    expect(aliceAsSeenByBob).toMatchObject({ position: { x: 3, y: 1.7, z: 1 }, rotationY: 2 });
  });

  it('silently drops a malformed move instead of crashing the server', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-3', playerId: 'alice-id', playerName: 'Alice' });

    alice.emit(SocketEvent.PlayerMove, { sessionId: 'table-3', playerId: 'alice-id' }); // missing position/rotationY

    // The server must still be alive and answering normal requests afterward.
    const followUp = await joinAck(alice, {
      sessionId: 'table-3',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(followUp.ok).toBe(true);
  });
});
