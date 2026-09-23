import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type SceneUpdateResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionJoin, payload, resolve));
}

function sceneUpdateAck(client: ClientSocket, payload: unknown): Promise<SceneUpdateResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SceneUpdate, payload, resolve));
}

function waitForSessionState(client: ClientSocket): Promise<GameState> {
  return new Promise((resolve) => client.once(SocketEvent.SessionState, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('Tabletop map & drawing (Milestone 5 exit check)', () => {
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

  it('the host switching the map background is seen live by everyone in the session', async () => {
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
    const sceneId = aliceJoined.state.scenes[0]!.id;

    await joinAck(bob, { sessionId: 'table-1', playerId: 'bob-id', playerName: 'Bob' });

    const bobSeesTheSwitch = waitForSessionState(bob);

    const updateResult = await sceneUpdateAck(alice, {
      sessionId: 'table-1',
      playerId: 'alice-id',
      sceneId,
      backgroundImage: 'https://example/dungeon.png',
    });
    expect(updateResult.ok).toBe(true);

    const broadcastToBob = await bobSeesTheSwitch;
    expect(broadcastToBob.scenes[0]!.backgroundImage).toBe('https://example/dungeon.png');
  });

  it('a non-host cannot switch the map', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    const aliceJoined = await joinAck(alice, {
      sessionId: 'table-2',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    if (!aliceJoined.ok) return;
    await joinAck(bob, { sessionId: 'table-2', playerId: 'bob-id', playerName: 'Bob' });

    const result = await sceneUpdateAck(bob, {
      sessionId: 'table-2',
      playerId: 'bob-id',
      sceneId: aliceJoined.state.scenes[0]!.id,
      backgroundImage: 'https://example/hack.png',
    });
    expect(result).toEqual({ ok: false, error: 'Only the host can update a scene.' });
  });

  it("one player's drawing stroke is seen live by another player, point by point", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    const aliceJoined = await joinAck(alice, {
      sessionId: 'table-3',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    if (!aliceJoined.ok) return;
    const sceneId = aliceJoined.state.scenes[0]!.id;
    await joinAck(bob, { sessionId: 'table-3', playerId: 'bob-id', playerName: 'Bob' });

    const bobSeesStart = new Promise((resolve) => bob.once(SocketEvent.DrawingStart, resolve));
    alice.emit(SocketEvent.DrawingStart, {
      sessionId: 'table-3',
      playerId: 'alice-id',
      sceneId,
      drawingId: 'd1',
      point: { x: 10, y: 10 },
    });
    expect(await bobSeesStart).toEqual({
      sessionId: 'table-3',
      playerId: 'alice-id',
      sceneId,
      drawingId: 'd1',
      point: { x: 10, y: 10 },
    });

    const bobSeesUpdate = new Promise((resolve) => bob.once(SocketEvent.DrawingUpdate, resolve));
    alice.emit(SocketEvent.DrawingUpdate, {
      sessionId: 'table-3',
      drawingId: 'd1',
      point: { x: 20, y: 15 },
    });
    expect(await bobSeesUpdate).toEqual({
      sessionId: 'table-3',
      drawingId: 'd1',
      point: { x: 20, y: 15 },
    });

    const bobSeesEnd = new Promise((resolve) => bob.once(SocketEvent.DrawingEnd, resolve));
    alice.emit(SocketEvent.DrawingEnd, { sessionId: 'table-3', drawingId: 'd1' });
    await bobSeesEnd;
  });

  it("a later joiner's initial session state includes the full stroke already drawn", async () => {
    const alice = await connect(url);
    clients.push(alice);

    const aliceJoined = await joinAck(alice, {
      sessionId: 'table-4',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    if (!aliceJoined.ok) return;
    const sceneId = aliceJoined.state.scenes[0]!.id;

    alice.emit(SocketEvent.DrawingStart, {
      sessionId: 'table-4',
      playerId: 'alice-id',
      sceneId,
      drawingId: 'd1',
      point: { x: 1, y: 1 },
    });
    alice.emit(SocketEvent.DrawingUpdate, {
      sessionId: 'table-4',
      drawingId: 'd1',
      point: { x: 2, y: 2 },
    });
    // No ack for drawing:* — give the server a tick to apply both before Bob joins.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const bob = await connect(url);
    clients.push(bob);
    const bobJoined = await joinAck(bob, {
      sessionId: 'table-4',
      playerId: 'bob-id',
      playerName: 'Bob',
    });
    if (!bobJoined.ok) return;

    expect(bobJoined.state.scenes[0]!.drawings).toEqual([
      {
        id: 'd1',
        sceneId,
        playerId: 'alice-id',
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    ]);
  });

  it('drawing:delete removes a stroke and is seen live by other players', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    const aliceJoined = await joinAck(alice, {
      sessionId: 'table-5',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    if (!aliceJoined.ok) return;
    const sceneId = aliceJoined.state.scenes[0]!.id;
    await joinAck(bob, { sessionId: 'table-5', playerId: 'bob-id', playerName: 'Bob' });

    alice.emit(SocketEvent.DrawingStart, {
      sessionId: 'table-5',
      playerId: 'alice-id',
      sceneId,
      drawingId: 'd1',
      point: { x: 0, y: 0 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const bobSeesDelete = new Promise((resolve) => bob.once(SocketEvent.DrawingDelete, resolve));
    alice.emit(SocketEvent.DrawingDelete, { sessionId: 'table-5', sceneId, drawingId: 'd1' });
    expect(await bobSeesDelete).toEqual({ sessionId: 'table-5', sceneId, drawingId: 'd1' });
  });
});
