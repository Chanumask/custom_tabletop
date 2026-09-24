import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { SocketEvent, type PlayerEmoteRequest } from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

function join(client: ClientSocket, sessionId: string, playerId: string) {
  return new Promise((resolve) =>
    client.emit(
      SocketEvent.SessionJoin,
      { sessionId, playerId, playerName: playerId, playerToken: `token-${playerId}` },
      resolve,
    ),
  );
}

/** Collects every emote `client` receives for `ms` milliseconds. */
function collectEmotes(client: ClientSocket, ms: number): Promise<PlayerEmoteRequest[]> {
  const received: PlayerEmoteRequest[] = [];
  const handler = (emote: PlayerEmoteRequest) => received.push(emote);
  client.on(SocketEvent.PlayerEmote, handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      client.off(SocketEvent.PlayerEmote, handler);
      resolve(received);
    }, ms),
  );
}

describe('player:emote', () => {
  let app: AppServer;
  let url: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    app = createAppServer();
    await new Promise<void>((resolve) => {
      app.http.listen(0, () => resolve());
    });
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

  async function connected() {
    const client = await connect(url);
    clients.push(client);
    return client;
  }

  it('relays an emote to everyone else in the session, but not back to the sender', async () => {
    const alice = await connected();
    const bob = await connected();
    const carol = await connected();
    await join(alice, 'em-1', 'alice');
    await join(bob, 'em-1', 'bob');
    await join(carol, 'em-1', 'carol');

    const bobSees = collectEmotes(bob, 150);
    const carolSees = collectEmotes(carol, 150);
    const aliceSees = collectEmotes(alice, 150);
    alice.emit(SocketEvent.PlayerEmote, { sessionId: 'em-1', playerId: 'alice', emote: 'wave' });

    expect(await bobSees).toEqual([{ sessionId: 'em-1', playerId: 'alice', emote: 'wave' }]);
    expect(await carolSees).toHaveLength(1);
    expect(await aliceSees).toHaveLength(0);
  });

  it('drops unknown emotes, forged identities, and spam', async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'em-2', 'alice');
    await join(bob, 'em-2', 'bob');

    const bobSees = collectEmotes(bob, 200);
    alice.emit(SocketEvent.PlayerEmote, {
      sessionId: 'em-2',
      playerId: 'alice',
      emote: 'moonwalk',
    });
    alice.emit(SocketEvent.PlayerEmote, { sessionId: 'em-2', playerId: 'bob', emote: 'wave' });
    alice.emit(SocketEvent.PlayerEmote, { sessionId: 'em-2', playerId: 'alice', emote: 'wave' });
    alice.emit(SocketEvent.PlayerEmote, { sessionId: 'em-2', playerId: 'alice', emote: 'punch' });

    // Only the first valid one gets through; the second is inside the
    // rate-limit window.
    expect((await bobSees).map((e) => e.emote)).toEqual(['wave']);
  });
});
