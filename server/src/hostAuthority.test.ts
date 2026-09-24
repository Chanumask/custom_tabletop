import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type SceneCreateResponse,
  type SceneChangeResponse,
  type PlayerMuteResponse,
  type PlayerUnmuteResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionJoin, payload, resolve));
}

function sceneCreateAck(client: ClientSocket, payload: unknown): Promise<SceneCreateResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SceneCreate, payload, resolve));
}

function sceneChangeAck(client: ClientSocket, payload: unknown): Promise<SceneChangeResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SceneChange, payload, resolve));
}

function muteAck(client: ClientSocket, payload: unknown): Promise<PlayerMuteResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.PlayerMute, payload, resolve));
}

function unmuteAck(client: ClientSocket, payload: unknown): Promise<PlayerUnmuteResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.PlayerUnmute, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

/**
 * Milestone 9's audit pass: every host-gated action in this app gets a live
 * socket test proving a manually-forged non-host request is rejected with
 * no effect, and that the host's own equivalent request still succeeds.
 * Not every host-gated action's test lives in this file — most already had
 * one from the milestone that introduced them, added as that milestone's own
 * "sanity work" per CLAUDE.md, and duplicating them here would just be
 * redundant test maintenance for no extra coverage:
 *
 * - scene:create           -> this file (new — only unit-tested before, at
 *                              the SessionStore level, not through a live
 *                              socket round trip)
 * - scene:change           -> this file (new — had no rejection test at all)
 * - scene:update           -> tabletopMap.test.ts, "a non-host cannot switch
 *                              the map"
 * - player:mute (of another) -> soundAndMute.test.ts, "a non-host cannot
 *                              mute another player, but the host can"
 * - player:unmute (of another) -> this file (new — mute had a rejection
 *                              test, unmute never did)
 *
 * sound:play was host-gated at the time of this audit but was **relaxed to
 * open-to-any-player** in a later wall-soundboard follow-up (see
 * docs/decisions.md and shared/src/sound.ts) — no longer listed above, since
 * there's no "reject the non-host" case for it any more.
 *
 * Nothing else is host-gated: dice:*, drawing:*, sound:play, sound:upload,
 * object:interact, and player:move are all deliberately open to any player
 * (see docs/decisions.md for each milestone's reasoning) — there's no
 * "reject the non-host" case to test for them, only the malformed-payload
 * rejection every event already has (validation.test.ts, plus each
 * milestone's own exit-check test). One gap in that latter category was
 * still open — drawing:* had no *socket-level* malformed-payload test (only
 * validation.ts's parser was unit-tested) — closed below too.
 */
describe('Host authority hardening (Milestone 9 exit check)', () => {
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

  it('a non-host cannot create a scene, but the host can', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'host-1', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'host-1', playerId: 'bob-id', playerName: 'Bob' });

    const bobResult = await sceneCreateAck(bob, {
      sessionId: 'host-1',
      playerId: 'bob-id',
      sceneId: 'forged-scene',
      name: 'Forged',
      backgroundImage: '',
    });
    expect(bobResult).toEqual({ ok: false, error: 'Only the host can create a scene.' });

    const aliceResult = await sceneCreateAck(alice, {
      sessionId: 'host-1',
      playerId: 'alice-id',
      sceneId: 'real-scene',
      name: 'Real',
      backgroundImage: '',
    });
    expect(aliceResult.ok).toBe(true);
  });

  it('a non-host cannot change the active scene, but the host can', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    const aliceJoined = await joinAck(alice, {
      sessionId: 'host-2',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    if (!aliceJoined.ok) return;
    const defaultSceneId = aliceJoined.state.scenes[0]!.id;
    await joinAck(bob, { sessionId: 'host-2', playerId: 'bob-id', playerName: 'Bob' });

    const bobResult = await sceneChangeAck(bob, {
      sessionId: 'host-2',
      playerId: 'bob-id',
      sceneId: defaultSceneId,
    });
    expect(bobResult).toEqual({ ok: false, error: 'Only the host can change the active scene.' });

    const aliceResult = await sceneChangeAck(alice, {
      sessionId: 'host-2',
      playerId: 'alice-id',
      sceneId: defaultSceneId,
    });
    expect(aliceResult.ok).toBe(true);
  });

  it('a non-host cannot unmute another player, but the host can', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    const carol = await connect(url);
    clients.push(alice, bob, carol);

    await joinAck(alice, { sessionId: 'host-3', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'host-3', playerId: 'bob-id', playerName: 'Bob' });
    await joinAck(carol, { sessionId: 'host-3', playerId: 'carol-id', playerName: 'Carol' });

    // Carol mutes herself first (self-service, always allowed) so there's
    // something real to unmute.
    const carolMutesSelf = await muteAck(carol, {
      sessionId: 'host-3',
      playerId: 'carol-id',
      targetPlayerId: 'carol-id',
    });
    expect(carolMutesSelf.ok).toBe(true);

    const bobUnmutesCarol = await unmuteAck(bob, {
      sessionId: 'host-3',
      playerId: 'bob-id',
      targetPlayerId: 'carol-id',
    });
    expect(bobUnmutesCarol).toEqual({ ok: false, error: 'Only the host can mute another player.' });

    const aliceUnmutesCarol = await unmuteAck(alice, {
      sessionId: 'host-3',
      playerId: 'alice-id',
      targetPlayerId: 'carol-id',
    });
    expect(aliceUnmutesCarol.ok).toBe(true);
  });

  it('a malformed drawing:start payload does not crash the server', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'host-4', playerId: 'alice-id', playerName: 'Alice' });

    // Missing sceneId/drawingId/point/color/width entirely — drawing:* has
    // no ack (fire-and-forget, per docs/decisions.md's Milestone 5 entry),
    // so the only way to prove the server survived is a follow-up acked
    // call, same technique as playerMove.test.ts's equivalent check.
    alice.emit(SocketEvent.DrawingStart, { sessionId: 'host-4', playerId: 'alice-id' });

    const followUp = await joinAck(alice, {
      sessionId: 'host-4',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(followUp.ok).toBe(true);
  });
});
