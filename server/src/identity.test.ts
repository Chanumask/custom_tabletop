import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type SceneUpdateResponse,
  type DiceSpawnResponse,
  type SessionTransferHostResponse,
  type DrawingStartRequest,
  type DrawingUpdateRequest,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

const GRACE_MS = 150;

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
  token = `token-${playerId}`,
): Promise<SessionJoinResponse> {
  return emitAck(client, SocketEvent.SessionJoin, {
    sessionId,
    playerId,
    playerName: playerId,
    playerToken: token,
  });
}

/** Resolves with the first session:state broadcast matching `predicate`. */
function waitForState(
  client: ClientSocket,
  predicate: (state: GameState) => boolean,
  timeoutMs = 2000,
): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(SocketEvent.SessionState, handler);
      reject(new Error('timed out waiting for a matching session:state'));
    }, timeoutMs);
    const handler = (state: GameState) => {
      if (predicate(state)) {
        clearTimeout(timer);
        client.off(SocketEvent.SessionState, handler);
        resolve(state);
      }
    };
    client.on(SocketEvent.SessionState, handler);
  });
}

/**
 * Identity binding (docs/decisions.md): a socket speaks only for the player
 * it joined as. Player ids are public — every client sees the host's id in
 * GameState — so before this, any player could perform host actions just by
 * putting the host's id in a payload. These are the live proofs that can't
 * happen any more, plus the presence/grace-period behavior built on the
 * same binding.
 */
describe('Identity binding & presence', () => {
  let app: AppServer;
  let url: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    app = createAppServer({ disconnectGraceMs: GRACE_MS });
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

  it("a player cannot perform a host action by forging the host's public id", async () => {
    const alice = await connected();
    const bob = await connected();
    const joined = await join(alice, 'id-1', 'alice');
    await join(bob, 'id-1', 'bob');
    if (!joined.ok) throw new Error('join failed');

    const forged = await emitAck<SceneUpdateResponse>(bob, SocketEvent.SceneUpdate, {
      sessionId: 'id-1',
      playerId: joined.state.hostId, // alice's id, read straight off GameState
      sceneId: joined.state.activeSceneId,
      backgroundImage: 'https://example.com/forged.png',
    });
    expect(forged).toEqual({ ok: false, error: 'Not joined to this session as that player.' });

    // No effect: the map is still blank for everyone.
    const check = await join(alice, 'id-1', 'alice');
    expect(check.ok && check.state.scenes[0]?.backgroundImage).toBe('');
  });

  it("cannot take over an existing player's identity without their token", async () => {
    const alice = await connected();
    const mallory = await connected();
    await join(alice, 'id-2', 'alice', 'alice-secret');

    const stolen = await join(mallory, 'id-2', 'alice', 'a-guess');
    expect(stolen).toEqual({ ok: false, error: 'That player identity belongs to someone else.' });
  });

  it('a socket that never joined cannot mutate a session', async () => {
    const alice = await connected();
    const lurker = await connected();
    await join(alice, 'id-3', 'alice');

    const spawn = await emitAck<DiceSpawnResponse>(lurker, SocketEvent.DiceSpawn, {
      sessionId: 'id-3',
      playerId: 'alice',
      diceId: 'd1',
      position: { x: 0, y: 1, z: 0 },
    });
    expect(spawn).toEqual({ ok: false, error: 'Not joined to this session as that player.' });
  });

  it("another player's in-progress stroke cannot be extended", async () => {
    const alice = await connected();
    const bob = await connected();
    const joined = await join(alice, 'id-4', 'alice');
    await join(bob, 'id-4', 'bob');
    if (!joined.ok) throw new Error('join failed');
    const sceneId = joined.state.activeSceneId;

    alice.emit(SocketEvent.DrawingStart, {
      sessionId: 'id-4',
      playerId: 'alice',
      sceneId,
      drawingId: 'stroke-1',
      point: { x: 1, y: 1 },
      color: '#000000',
      width: 4,
    } satisfies DrawingStartRequest);
    bob.emit(SocketEvent.DrawingUpdate, {
      sessionId: 'id-4',
      drawingId: 'stroke-1',
      point: { x: 500, y: 500 },
    } satisfies DrawingUpdateRequest);

    // Acked round trip after both fire-and-forget events, so they've been processed.
    const check = await join(alice, 'id-4', 'alice');
    expect(check.ok && check.state.scenes[0]?.drawings[0]?.points).toEqual([{ x: 1, y: 1 }]);
  });

  it('a reconnect on a new socket takes over, and the old socket is told it was replaced', async () => {
    const firstTab = await connected();
    await join(firstTab, 'id-5', 'alice');
    const replaced = new Promise<void>((resolve) =>
      firstTab.once(SocketEvent.SessionReplaced, () => resolve()),
    );

    const reloadedTab = await connected();
    const rejoined = await join(reloadedTab, 'id-5', 'alice');
    expect(rejoined.ok && rejoined.state.players).toHaveLength(1);
    await replaced;

    // The old socket no longer speaks for alice.
    const stale = await emitAck<DiceSpawnResponse>(firstTab, SocketEvent.DiceSpawn, {
      sessionId: 'id-5',
      playerId: 'alice',
      diceId: 'd1',
      position: { x: 0, y: 1, z: 0 },
    });
    expect(stale.ok).toBe(false);
  });

  it('a dropped player shows as reconnecting, then is removed after the grace period', async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'id-6', 'alice');
    await join(bob, 'id-6', 'bob');

    const away = waitForState(alice, (state) =>
      state.players.some((player) => player.id === 'bob' && !player.connected),
    );
    bob.disconnect();
    await away;

    const gone = await waitForState(alice, (state) =>
      state.players.every((player) => player.id !== 'bob'),
    );
    expect(gone.players.map((player) => player.id)).toEqual(['alice']);
  });

  it('a dropped player who comes back within the grace period keeps their spot', async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'id-7', 'alice');
    await join(bob, 'id-7', 'bob');

    const away = waitForState(alice, (state) =>
      state.players.some((player) => player.id === 'bob' && !player.connected),
    );
    bob.disconnect();
    await away;

    const bobAgain = await connected();
    const rejoined = await join(bobAgain, 'id-7', 'bob');
    expect(rejoined.ok && rejoined.state.players.find((p) => p.id === 'bob')?.connected).toBe(true);

    // Outlive the original grace period — bob must still be there.
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS * 2));
    const check = await join(alice, 'id-7', 'alice');
    expect(check.ok && check.state.players.map((player) => player.id)).toEqual(['alice', 'bob']);
  });

  it('when a dropped host times out, the host role passes to a remaining player', async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'id-8', 'alice');
    await join(bob, 'id-8', 'bob');

    const handedOver = waitForState(bob, (state) => state.hostId === 'bob');
    alice.disconnect();
    const state = await handedOver;
    expect(state.players.map((player) => player.id)).toEqual(['bob']);
  });

  it('an automatic (resume) rejoin fails cleanly once the session is gone instead of recreating it', async () => {
    const alice = await connected();
    const resumed = await emitAck<SessionJoinResponse>(alice, SocketEvent.SessionJoin, {
      sessionId: 'id-10',
      playerId: 'alice',
      playerName: 'Alice',
      playerToken: 'token-alice',
      resume: true,
    });
    expect(resumed).toEqual({ ok: false, error: 'That session has ended.' });

    // A deliberate (non-resume) join still creates it as usual, after which
    // a resume join works.
    await join(alice, 'id-10', 'alice');
    const resumedAgain = await emitAck<SessionJoinResponse>(alice, SocketEvent.SessionJoin, {
      sessionId: 'id-10',
      playerId: 'alice',
      playerName: 'Alice',
      playerToken: 'token-alice',
      resume: true,
    });
    expect(resumedAgain.ok).toBe(true);
  });

  it('the host can hand the host role to another player; a non-host cannot', async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'id-9', 'alice');
    await join(bob, 'id-9', 'bob');

    const bobTries = await emitAck<SessionTransferHostResponse>(
      bob,
      SocketEvent.SessionTransferHost,
      { sessionId: 'id-9', playerId: 'bob', targetPlayerId: 'bob' },
    );
    expect(bobTries).toEqual({ ok: false, error: 'Only the host can hand over the host role.' });

    const aliceHandsOver = await emitAck<SessionTransferHostResponse>(
      alice,
      SocketEvent.SessionTransferHost,
      { sessionId: 'id-9', playerId: 'alice', targetPlayerId: 'bob' },
    );
    expect(aliceHandsOver.ok && aliceHandsOver.state.hostId).toBe('bob');
  });
});
