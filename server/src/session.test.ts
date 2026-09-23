import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type SessionLeaveResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionJoin, payload, resolve));
}

function leaveAck(client: ClientSocket, payload: unknown): Promise<SessionLeaveResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionLeave, payload, resolve));
}

function waitForSessionState(client: ClientSocket): Promise<GameState> {
  return new Promise((resolve) => client.once(SocketEvent.SessionState, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('Sessions & connection (Milestone 2 exit check)', () => {
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

  it('two clients joining the same session see each other in the player list', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    const aliceJoined = await joinAck(alice, {
      sessionId: 'table-1',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(aliceJoined.ok).toBe(true);
    if (!aliceJoined.ok) return;
    expect(aliceJoined.state.players.map((p) => p.name)).toEqual(['Alice']);
    expect(aliceJoined.state.hostId).toBe('alice-id');

    // Alice is already in the session's room; she should see a live
    // broadcast the moment Bob joins, without asking again.
    const aliceSeesBobJoin = waitForSessionState(alice);

    const bobJoined = await joinAck(bob, {
      sessionId: 'table-1',
      playerId: 'bob-id',
      playerName: 'Bob',
    });
    expect(bobJoined.ok).toBe(true);
    if (!bobJoined.ok) return;
    expect(bobJoined.state.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(bobJoined.state.hostId).toBe('alice-id'); // first joiner stays host

    const broadcastToAlice = await aliceSeesBobJoin;
    expect(broadcastToAlice.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  });

  it('a dropped connection can rejoin the same session as the same player, then leave removes them', async () => {
    const alice = await connect(url);
    clients.push(alice);

    await joinAck(alice, { sessionId: 'table-2', playerId: 'alice-id', playerName: 'Alice' });

    // Simulate a dropped connection (tab refresh, network blip): disconnect
    // and reconnect with a NEW socket but the SAME client-generated playerId.
    alice.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceAgain = await connect(url);
    clients.push(aliceAgain);

    const rejoined = await joinAck(aliceAgain, {
      sessionId: 'table-2',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(rejoined.ok).toBe(true);
    if (!rejoined.ok) return;
    expect(rejoined.state.players).toHaveLength(1); // rebound, not duplicated

    const left = await leaveAck(aliceAgain, { sessionId: 'table-2', playerId: 'alice-id' });
    expect(left.ok).toBe(true);
  });

  it('rejects a malformed join payload with an error ack instead of crashing', async () => {
    const client = await connect(url);
    clients.push(client);

    const result = await joinAck(client, { sessionId: '', playerId: 'p1', playerName: 'Alice' });
    expect(result.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await joinAck(client, {
      sessionId: 'table-3',
      playerId: 'p1',
      playerName: 'Alice',
    });
    expect(followUp.ok).toBe(true);
  });
});
