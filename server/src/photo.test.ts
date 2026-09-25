import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type ItemTakeResponse,
  type PhotoCaptureResponse,
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

function captureAck(client: ClientSocket, payload: unknown): Promise<PhotoCaptureResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.PhotoCapture, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('The camera and pinboard (gadgets phase 2 exit check)', () => {
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

  it('rejects a photo from a player not holding the camera', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'photo-1', playerId: 'alice-id', playerName: 'Alice' });

    const result = await captureAck(alice, {
      sessionId: 'photo-1',
      playerId: 'alice-id',
      url: 'https://example.com/uploads/images/a.jpg',
    });
    expect(result).toEqual({ ok: false, error: 'You need the camera to take a photo.' });
  });

  it('a photo taken by the camera holder is pinned and seen live by everyone', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'photo-2', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'photo-2', playerId: 'bob-id', playerName: 'Bob' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await takeAck(bob, { sessionId: 'photo-2', playerId: 'bob-id', itemId: 'camera-1' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesThePhoto = nextUpdate(alice);
    const result = await captureAck(bob, {
      sessionId: 'photo-2',
      playerId: 'bob-id',
      url: 'https://example.com/uploads/images/b.jpg',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.photos).toHaveLength(1);
    expect(result.state.photos[0]).toMatchObject({
      url: 'https://example.com/uploads/images/b.jpg',
      takenBy: 'bob-id',
    });

    const broadcast = (await aliceSeesThePhoto) as {
      photos: { url: string; takenBy: string }[];
    };
    expect(broadcast.photos[0]).toMatchObject({
      url: 'https://example.com/uploads/images/b.jpg',
      takenBy: 'bob-id',
    });
  });

  it('rejects a malformed payload without crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'photo-3', playerId: 'alice-id', playerName: 'Alice' });
    await takeAck(alice, { sessionId: 'photo-3', playerId: 'alice-id', itemId: 'camera-1' });

    const malformed = await captureAck(alice, { sessionId: 'photo-3', playerId: 'alice-id' });
    expect(malformed.ok).toBe(false);

    const notAUrl = await captureAck(alice, {
      sessionId: 'photo-3',
      playerId: 'alice-id',
      url: 'not a url',
    });
    expect(notAUrl.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await captureAck(alice, {
      sessionId: 'photo-3',
      playerId: 'alice-id',
      url: 'https://example.com/uploads/images/c.jpg',
    });
    expect(followUp.ok).toBe(true);
  });
});
