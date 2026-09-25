import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type PlayerColorId,
  type PlayerUpdateResponse,
  type SessionJoinResponse,
  type SessionPeekResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { waitForState } from './testSupport.js';

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

function join(
  client: ClientSocket,
  sessionId: string,
  playerId: string,
  color?: PlayerColorId,
): Promise<SessionJoinResponse> {
  return emitAck(client, SocketEvent.SessionJoin, {
    sessionId,
    playerId,
    playerName: playerId,
    playerToken: `token-${playerId}`,
    color,
  });
}

const nextState = waitForState;

/** Player colors & profiles: unique colors per session (which caps a
 * session at eight players), a pre-join peek for the join screen, and live
 * in-session name/color changes everyone sees. */
describe('Player colors & profiles', () => {
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

  async function connected(): Promise<ClientSocket> {
    const client = await connect(url);
    clients.push(client);
    return client;
  }

  it('honors a free preferred color and falls back when it is taken', async () => {
    const alice = await connected();
    const bob = await connected();

    const aliceJoin = await join(alice, 'pc-1', 'alice', 'purple');
    const bobJoin = await join(bob, 'pc-1', 'bob', 'purple');

    expect(aliceJoin.ok && aliceJoin.state.players[0]?.color).toBe('purple');
    const bobColor = bobJoin.ok && bobJoin.state.players.find((p) => p.id === 'bob')?.color;
    expect(bobColor).not.toBe('purple');
    expect(bobColor).toBeTruthy();
  });

  it('peek shows a session before joining it (and needs no join)', async () => {
    const alice = await connected();
    const visitor = await connected();
    await join(alice, 'pc-2', 'alice', 'green');

    expect(
      await emitAck<SessionPeekResponse>(visitor, SocketEvent.SessionPeek, { sessionId: 'pc-2' }),
    ).toEqual({ exists: true, playerCount: 1, hostName: 'alice', takenColors: ['green'] });
    expect(
      (await emitAck<SessionPeekResponse>(visitor, SocketEvent.SessionPeek, { sessionId: 'nope' }))
        .exists,
    ).toBe(false);
  });

  it('a ninth player is turned away, but a returning player still gets back in', async () => {
    const players: ClientSocket[] = [];
    for (let i = 1; i <= 8; i += 1) {
      const client = await connected();
      players.push(client);
      expect((await join(client, 'pc-3', `p${i}`)).ok).toBe(true);
    }

    const ninth = await connected();
    expect(await join(ninth, 'pc-3', 'p9')).toEqual({
      ok: false,
      error: 'That session is full (8 players max).',
    });

    const p3Again = await connected();
    expect((await join(p3Again, 'pc-3', 'p3')).ok).toBe(true);
  });

  it("a player's name/color change is seen live by everyone; another's color is refused", async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'pc-4', 'alice', 'red');
    await join(bob, 'pc-4', 'bob', 'blue');

    const refused = await emitAck<PlayerUpdateResponse>(bob, SocketEvent.PlayerUpdate, {
      sessionId: 'pc-4',
      playerId: 'bob',
      color: 'red',
    });
    expect(refused).toEqual({ ok: false, error: 'That color is already taken.' });

    const seenByAlice = nextState(alice, (state) =>
      state.players.some((player) => player.id === 'bob' && player.color === 'yellow'),
    );
    const changed = await emitAck<PlayerUpdateResponse>(bob, SocketEvent.PlayerUpdate, {
      sessionId: 'pc-4',
      playerId: 'bob',
      name: 'Robert',
      color: 'yellow',
    });
    expect(changed.ok).toBe(true);
    const state = await seenByAlice;
    expect(state.players.find((player) => player.id === 'bob')?.name).toBe('Robert');
  });

  it("a player cannot change someone else's profile", async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'pc-5', 'alice');
    await join(bob, 'pc-5', 'bob');

    const forged = await emitAck<PlayerUpdateResponse>(bob, SocketEvent.PlayerUpdate, {
      sessionId: 'pc-5',
      playerId: 'alice',
      name: 'Hacked',
    });
    expect(forged).toEqual({ ok: false, error: 'Not joined to this session as that player.' });
  });
});
