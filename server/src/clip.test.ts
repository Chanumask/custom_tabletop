import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  CLIP_LOCKED_ERROR,
  SocketEvent,
  clipPositionAt,
  type ClipControlResponse,
  type GameState,
  type SessionJoinResponse,
  type SharedClip,
  type SoundPlayRequest,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { waitForState } from './testSupport.js';

// The shared YouTube clip (docs/decisions.md, "Synced clips").

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30';

let app: AppServer;
let url: string;
let clients: ClientSocket[];

beforeEach(async () => {
  app = createAppServer();
  await new Promise<void>((resolve) => app.http.listen(0, () => resolve()));
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

async function connect(): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  return client;
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

async function join(client: ClientSocket, playerId: string): Promise<SessionJoinResponse> {
  return emitAck(client, SocketEvent.SessionJoin, {
    sessionId: 'ROOM',
    playerId,
    playerName: playerId,
    playerToken: `token-${playerId}`,
  });
}

/** Alice (host) and Bob at the table, with a YouTube link on the board. */
async function tableWithClip() {
  const alice = await connect();
  const bob = await connect();
  await join(alice, 'alice');
  await join(bob, 'bob');
  await emitAck(alice, SocketEvent.SoundUpload, {
    sessionId: 'ROOM',
    playerId: 'alice',
    soundId: 'yt',
    name: 'Big Buck Bunny',
    url: YOUTUBE_URL,
  });
  const started = waitForState(bob, (state) => Boolean(state.clip));
  await emitAck(alice, SocketEvent.SoundPlay, {
    sessionId: 'ROOM',
    playerId: 'alice',
    soundId: 'yt',
  } satisfies SoundPlayRequest);
  const clip = (await started).clip!;
  return { alice, bob, clip };
}

const control = (
  client: ClientSocket,
  playerId: string,
  clip: SharedClip,
  action: string,
  position: number,
) =>
  emitAck<ClipControlResponse>(client, SocketEvent.ClipControl, {
    sessionId: 'ROOM',
    playerId,
    clipId: clip.id,
    action,
    position,
  });

describe('the shared clip', () => {
  it('a YouTube soundboard entry starts a shared clip for everyone, at its start time', async () => {
    const { clip } = await tableWithClip();
    expect(clip).toMatchObject({
      videoId: 'aqz-KE-bpKQ',
      title: 'Big Buck Bunny',
      playedBy: 'alice',
      playing: true,
      position: 30,
    });
  });

  it('anyone can pause, play and seek it; everyone follows the new anchor', async () => {
    const { alice, bob, clip } = await tableWithClip();
    const paused = waitForState(alice, (state) => state.clip?.playing === false);
    expect(await control(bob, 'bob', clip, 'pause', 42)).toEqual({ ok: true });
    expect((await paused).clip).toMatchObject({ playing: false, position: 42 });

    const sought = waitForState(bob, (state) => state.clip?.position === 90);
    await control(alice, 'alice', clip, 'seek', 90);
    expect((await sought).clip!.playing).toBe(false); // seeking keeps it paused

    const playing = waitForState(bob, (state) => state.clip?.playing === true);
    await control(bob, 'bob', clip, 'play', 90);
    expect((await playing).clip!.position).toBe(90);
  });

  it('stop ends it for everyone; a control for an old clip is refused', async () => {
    const { alice, bob, clip } = await tableWithClip();
    const stopped = waitForState(alice, (state: GameState) => state.clip === null);
    await control(bob, 'bob', clip, 'stop', 50);
    await stopped;
    expect(await control(alice, 'alice', clip, 'pause', 1)).toEqual({
      ok: false,
      error: 'That clip has already finished.',
    });
  });

  it('while the host has locked it, only the host controls it — but it can still end', async () => {
    const { alice, bob, clip } = await tableWithClip();
    expect(
      await emitAck(bob, SocketEvent.ClipLock, {
        sessionId: 'ROOM',
        playerId: 'bob',
        locked: true,
      }),
    ).toEqual({ ok: false, error: 'Only the host can lock the TV.' });

    const locked = waitForState(bob, (state) => state.clipLocked);
    await emitAck(alice, SocketEvent.ClipLock, {
      sessionId: 'ROOM',
      playerId: 'alice',
      locked: true,
    });
    await locked;
    expect(await control(bob, 'bob', clip, 'pause', 40)).toEqual({
      ok: false,
      error: CLIP_LOCKED_ERROR,
    });
    expect(await control(alice, 'alice', clip, 'pause', 40)).toEqual({ ok: true });
    expect(await control(bob, 'bob', clip, 'ended', 600)).toEqual({ ok: true });
  });

  it('rejects nonsense positions and actions', async () => {
    const { bob, clip } = await tableWithClip();
    expect((await control(bob, 'bob', clip, 'explode', 1)).ok).toBe(false);
    expect((await control(bob, 'bob', clip, 'seek', -5)).ok).toBe(false);
    expect((await control(bob, 'bob', clip, 'seek', 1e9)).ok).toBe(false);
  });

  it('other sounds still just play once, without a clip', async () => {
    const alice = await connect();
    await join(alice, 'alice');
    const heard = new Promise<SoundPlayRequest>((resolve) =>
      alice.once(SocketEvent.SoundPlay, resolve),
    );
    await emitAck(alice, SocketEvent.SoundPlay, {
      sessionId: 'ROOM',
      playerId: 'alice',
      soundId: 'bell',
    });
    expect((await heard).soundId).toBe('bell');
  });

  it("the join ack carries the server's clock, for computing where the clip is", async () => {
    const alice = await connect();
    const before = Date.now();
    const joined = await join(alice, 'alice');
    expect(joined.ok && joined.serverNow).toBeGreaterThanOrEqual(before);
  });
});

describe('clipPositionAt', () => {
  const clip: SharedClip = {
    id: 'c',
    soundId: 's',
    videoId: 'v',
    title: 't',
    playedBy: 'p',
    playing: true,
    position: 10,
    anchorAt: 1_000_000,
  };

  it('advances with the clock while playing, stands still while paused', () => {
    expect(clipPositionAt(clip, 1_000_000 + 5_000)).toBe(15);
    expect(clipPositionAt({ ...clip, playing: false }, 1_000_000 + 5_000)).toBe(10);
    expect(clipPositionAt(clip, 1_000_000 - 3_000)).toBe(10); // never before the anchor
  });
});
