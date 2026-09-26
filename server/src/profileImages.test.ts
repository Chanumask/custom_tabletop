import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  PROFILE_IMAGE_MAX_BYTES,
  SocketEvent,
  type GameState,
  type HostActionResponse,
  type ProfileImage,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type SessionTransferHostResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer, type AppServerOptions } from './server.js';
import { PROFILE_IMAGE_ROUTE } from './profileImages.js';
import { eventually, onStateUpdates } from './testSupport.js';
import { SECRET, jpegWithMetadata, png, pngWithMetadata, riff, vp8l } from './testImages.js';

// Player profiles end to end (docs/decisions.md, "Player profiles"): real
// servers, real sockets, real HTTP requests.

const GRACE_MS = 150;
const TABLE = 'PROFILE';
let dir: string;
let profilesDir: string;
let servers: AppServer[];
let clients: ClientSocket[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
  profilesDir = path.join(dir, 'tables', 'profiles');
  servers = [];
  clients = [];
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  for (const server of servers) await stop(server);
  fs.rmSync(dir, { recursive: true, force: true });
});

async function start(options: Partial<AppServerOptions> = {}): Promise<string> {
  const app = createAppServer({
    tablesDir: path.join(dir, 'tables'),
    uploadsDir: path.join(dir, 'uploads'),
    disconnectGraceMs: GRACE_MS,
    ...options,
  });
  servers.push(app);
  await new Promise<void>((resolve) => app.http.listen(0, () => resolve()));
  const address = app.http.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://localhost:${address.port}`;
}

async function stop(app: AppServer): Promise<void> {
  if (!app.http.listening) return;
  app.io.close();
  await new Promise<void>((resolve) => app.http.close(() => resolve()));
}

interface Seat {
  client: ClientSocket;
  playerId: string;
  /** What this player's client currently knows (acks and broadcasts). */
  view: () => GameState;
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

async function sit(url: string, playerId: string): Promise<Seat> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  let state = {} as GameState;
  onStateUpdates(client, (next) => (state = next));
  const joined = await emitAck<SessionJoinResponse>(client, SocketEvent.SessionJoin, {
    sessionId: TABLE,
    playerId,
    playerName: playerId,
    playerToken: tokenOf(playerId),
  });
  if (!joined.ok) throw new Error(joined.error);
  state = joined.state;
  return { client, playerId, view: () => state };
}

const tokenOf = (playerId: string) => `secret-token-of-${playerId}`;

function headers(playerId: string, token = tokenOf(playerId), table = TABLE) {
  return {
    'X-Table': encodeURIComponent(table),
    'X-Player': encodeURIComponent(playerId),
    Authorization: `Bearer ${token}`,
  };
}

function share(url: string, playerId: string, body: Buffer, init: RequestInit = {}) {
  return fetch(`${url}${PROFILE_IMAGE_ROUTE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', ...headers(playerId) },
    body,
    ...init,
  });
}

async function shareOk(url: string, playerId: string, body: Buffer): Promise<ProfileImage> {
  const response = await share(url, playerId, body);
  const json = (await response.json()) as { profileImage?: ProfileImage; error?: string };
  if (!response.ok || !json.profileImage) throw new Error(json.error ?? String(response.status));
  return json.profileImage;
}

function view(url: string, viewer: string, target: string, init: { token?: string } = {}) {
  return fetch(`${url}${PROFILE_IMAGE_ROUTE}/${encodeURIComponent(target)}`, {
    headers: headers(viewer, init.token),
  });
}

const profileOf = (seat: Seat, playerId: string) =>
  seat.view().players?.find((player) => player.id === playerId)?.profileImage ?? null;

const storedFiles = () => (fs.existsSync(profilesDir) ? fs.readdirSync(profilesDir) : []);

describe('sharing a profile image', () => {
  it('reaches its owner and the host — and nobody else learns there is one', async () => {
    const url = await start();
    const host = await sit(url, 'host');
    const alice = await sit(url, 'alice');
    const bob = await sit(url, 'bob');
    const bobUpdates: GameState[] = [];
    onStateUpdates(bob.client, (state) => bobUpdates.push(state));

    const image = await shareOk(url, 'alice', png(64, 90));
    expect(image).toMatchObject({ type: 'png', width: 64, height: 90 });

    await eventually(() => {
      expect(profileOf(host, 'alice')).toEqual(image);
      expect(profileOf(alice, 'alice')).toEqual(image);
    });
    // Bob isn't even sent an update about it.
    expect(bobUpdates).toEqual([]);
    expect(profileOf(bob, 'alice')).toBeNull();

    // Nor does a later broadcast of the players give it away.
    await emitAck(bob.client, SocketEvent.PlayerUpdate, {
      sessionId: TABLE,
      playerId: 'bob',
      name: 'Bobby',
    });
    await eventually(() =>
      expect(bob.view().players.find((p) => p.id === 'bob')?.name).toBe('Bobby'),
    );
    expect(profileOf(bob, 'alice')).toBeNull();
    expect(profileOf(host, 'alice')).toEqual(image);

    // A newcomer's join ack doesn't carry it either.
    const carol = await sit(url, 'carol');
    expect(profileOf(carol, 'alice')).toBeNull();
  });

  it('is served to its owner and the host, and to no one else', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    await sit(url, 'bob');
    await shareOk(url, 'alice', png(64, 90));
    const stored = png(64, 90); // no metadata: stored exactly as sent

    for (const viewer of ['host', 'alice']) {
      const response = await view(url, viewer, 'alice');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(stored);
    }

    const other = await view(url, 'bob', 'alice');
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({
      error: 'Only the host can see other players’ profiles.',
    });
  });

  it('refuses anyone who can’t prove who they are', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    await shareOk(url, 'alice', png(10, 10));

    const attempts = [
      // No credentials at all.
      fetch(`${url}${PROFILE_IMAGE_ROUTE}/alice`),
      // The host's id with a wrong token.
      view(url, 'host', 'alice', { token: 'guessed' }),
      // Alice's token presented as the host's.
      view(url, 'host', 'alice', { token: tokenOf('alice') }),
      // Someone who was never at the table.
      view(url, 'mallory', 'alice'),
      // The right people, the wrong table.
      fetch(`${url}${PROFILE_IMAGE_ROUTE}/alice`, { headers: headers('host', undefined, 'OTHER') }),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('rejoin') });
    }

    // Nor can anyone share one in someone else's name.
    const forged = await fetch(`${url}${PROFILE_IMAGE_ROUTE}`, {
      method: 'PUT',
      headers: headers('alice', tokenOf('host')),
      body: png(10, 10),
    });
    expect(forged.status).toBe(401);
  });

  it('comes back 404 when there’s nothing shared', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    expect((await view(url, 'host', 'alice')).status).toBe(404);
    expect((await view(url, 'host', 'nobody')).status).toBe(404);
  });

  it('is stored without location, camera or any other hidden data', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    for (const [body, type] of [
      [pngWithMetadata(20, 20, 6), 'image/png'],
      [jpegWithMetadata(64, 48, { orientation: 6 }), 'image/jpeg'],
    ] as const) {
      const image = await shareOk(url, 'alice', body);
      expect(image.bytes).toBeLessThan(body.length);
      const response = await view(url, 'host', 'alice');
      expect(response.headers.get('content-type')).toBe(type);
      const served = Buffer.from(await response.arrayBuffer());
      expect(served.length).toBe(image.bytes);
      expect(served.includes(SECRET)).toBe(false);
    }
    // Nothing on disk has it either.
    for (const file of storedFiles()) {
      expect(fs.readFileSync(path.join(profilesDir, file)).includes(SECRET)).toBe(false);
    }
  });

  it('gives a sideways phone photo’s size as it shows, upright', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    const image = await shareOk(url, 'alice', jpegWithMetadata(64, 48, { orientation: 6 }));
    expect(image).toMatchObject({ type: 'jpeg', width: 48, height: 64 });
  });

  it('can be replaced and withdrawn, leaving no files behind', async () => {
    const url = await start();
    const host = await sit(url, 'host');
    await sit(url, 'alice');

    const first = await shareOk(url, 'alice', png(10, 10));
    const second = await shareOk(url, 'alice', riff([vp8l(30, 20)]));
    expect(second.id).not.toBe(first.id);
    await eventually(() => expect(profileOf(host, 'alice')).toEqual(second));
    await eventually(() => expect(storedFiles()).toEqual([`${second.id}.webp`]));
    expect((await view(url, 'host', 'alice')).headers.get('content-type')).toBe('image/webp');

    const removed = await fetch(`${url}${PROFILE_IMAGE_ROUTE}`, {
      method: 'DELETE',
      headers: headers('alice'),
    });
    expect(removed.status).toBe(200);
    await eventually(() => expect(profileOf(host, 'alice')).toBeNull());
    await eventually(() => expect(storedFiles()).toEqual([]));
    expect((await view(url, 'host', 'alice')).status).toBe(404);
  });

  it('refuses what isn’t a PNG, JPG or WebP, or is damaged, huge or empty', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    const cases: [Buffer, number, RegExp][] = [
      [Buffer.from('GIF89a' + 'x'.repeat(40)), 415, /PNG, JPG or WebP/],
      [Buffer.from('<html><script>alert(1)</script></html>'), 415, /PNG, JPG or WebP/],
      [png(10, 10).subarray(0, 60), 400, /damaged/],
      [png(9000, 9000).subarray(0, 33), 400, /9000 × 9000/],
      [Buffer.alloc(0), 400, /empty/],
    ];
    for (const [body, status, error] of cases) {
      const response = await share(url, 'alice', body);
      expect(response.status).toBe(status);
      expect(((await response.json()) as { error: string }).error).toMatch(error);
    }
    const tooBig = await share(url, 'alice', Buffer.alloc(PROFILE_IMAGE_MAX_BYTES + 1));
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toMatchObject({ error: expect.stringContaining('10 MB') });
    expect(storedFiles()).toEqual([]);
  }, 30_000); // sends 10 MB
});

describe('a profile image’s life', () => {
  it('goes with its player: leaving, being removed, or not coming back', async () => {
    const url = await start();
    const host = await sit(url, 'host');
    const alice = await sit(url, 'alice');
    const bob = await sit(url, 'bob');
    const carol = await sit(url, 'carol');
    await shareOk(url, 'alice', png(10, 10));
    await shareOk(url, 'bob', png(10, 10));
    await shareOk(url, 'carol', png(10, 10));
    expect(storedFiles()).toHaveLength(3);

    // Alice leaves.
    await emitAck<SessionLeaveResponse>(alice.client, SocketEvent.SessionLeave, {
      sessionId: TABLE,
      playerId: 'alice',
    });
    await eventually(() => expect(storedFiles()).toHaveLength(2));

    // The host removes Bob.
    const removed = await emitAck<HostActionResponse>(host.client, SocketEvent.HostAction, {
      sessionId: TABLE,
      playerId: 'host',
      action: 'remove',
      targetPlayerId: 'bob',
    });
    expect(removed.ok).toBe(true);
    await eventually(() => expect(storedFiles()).toHaveLength(1));
    void bob;

    // Carol's connection drops and she doesn't come back in time.
    carol.client.disconnect();
    await eventually(() => expect(storedFiles()).toEqual([]), 3000);
    expect((await view(url, 'host', 'carol')).status).toBe(404);
  });

  it('stays through a reload (the same player rejoining)', async () => {
    const url = await start();
    await sit(url, 'host');
    const alice = await sit(url, 'alice');
    const image = await shareOk(url, 'alice', png(10, 10));
    alice.client.disconnect();
    const again = await sit(url, 'alice');
    expect(profileOf(again, 'alice')).toEqual(image);
    expect((await view(url, 'host', 'alice')).status).toBe(200);
  });

  it('follows the host role: the new host sees it, the old one no longer does', async () => {
    const url = await start();
    const host = await sit(url, 'host');
    const alice = await sit(url, 'alice');
    const bob = await sit(url, 'bob');
    const image = await shareOk(url, 'alice', png(10, 10));
    await eventually(() => expect(profileOf(host, 'alice')).toEqual(image));

    const handed = await emitAck<SessionTransferHostResponse>(
      host.client,
      SocketEvent.SessionTransferHost,
      { sessionId: TABLE, playerId: 'host', targetPlayerId: 'bob' },
    );
    expect(handed.ok).toBe(true);
    await eventually(() => {
      expect(profileOf(bob, 'alice')).toEqual(image);
      expect(profileOf(host, 'alice')).toBeNull();
    });
    expect(profileOf(alice, 'alice')).toEqual(image);
    expect((await view(url, 'host', 'alice')).status).toBe(403);
    expect((await view(url, 'bob', 'alice')).status).toBe(200);

    // And when the host leaves, whoever takes over sees it too.
    await emitAck(bob.client, SocketEvent.SessionLeave, { sessionId: TABLE, playerId: 'bob' });
    await eventually(() => expect(host.view().hostId).toBe('host'));
    await eventually(() => expect(profileOf(host, 'alice')).toEqual(image));
    expect((await view(url, 'host', 'alice')).status).toBe(200);
  });

  it('survives a restart with its table, and is let go if its file didn’t', async () => {
    let url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    await sit(url, 'bob');
    const aliceImage = await shareOk(url, 'alice', png(10, 10));
    const bobImage = await shareOk(url, 'bob', png(12, 12));
    await stop(servers.pop()!); // saves the table
    clients.forEach((client) => client.disconnect());
    // Bob's file is lost while the server is down.
    fs.rmSync(path.join(profilesDir, `${bobImage.id}.png`));

    url = await start();
    const host = await sit(url, 'host');
    expect(profileOf(host, 'alice')).toEqual(aliceImage);
    expect(profileOf(host, 'bob')).toBeNull();
    expect((await view(url, 'host', 'alice')).status).toBe(200);
  });

  it('sweeps files no table uses, and leaves other files alone', async () => {
    fs.mkdirSync(profilesDir, { recursive: true });
    const orphan = path.join(profilesDir, '0b6f3c1e-8f0a-4c5e-9d2b-3a1f7e6c5d4b.png');
    const leftover = path.join(profilesDir, '.0b6f3c1e-8f0a-4c5e-9d2b-3a1f7e6c5d4c.tmp');
    const notOurs = path.join(profilesDir, 'README.txt');
    for (const file of [orphan, leftover, notOurs]) fs.writeFileSync(file, 'x');
    await start({ profilePolicy: { maxBytes: 1024 * 1024, minAgeMs: 0 } });
    expect(storedFiles()).toEqual(['README.txt']);
  });
});

describe('limits', () => {
  it('rate-limits shares per client', async () => {
    const url = await start({ profileUploadLimit: { limit: 2, windowMs: 60_000 } });
    await sit(url, 'host');
    await sit(url, 'alice');
    expect((await share(url, 'alice', png(5, 5))).status).toBe(200);
    expect((await share(url, 'alice', png(5, 5))).status).toBe(200);
    const third = await share(url, 'alice', png(5, 5));
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({ error: expect.stringContaining('Too many') });
  });

  it('says so when the server’s profile storage is full', async () => {
    const url = await start({ profilePolicy: { maxBytes: 50, minAgeMs: 0 } });
    await sit(url, 'host');
    await sit(url, 'alice');
    const response = await share(url, 'alice', png(40, 40));
    expect(response.status).toBe(507);
    expect(storedFiles()).toEqual([]);
  });

  it('turns uploads away while too many are in progress', async () => {
    const url = await start({ maxConcurrentProfileUploads: 0 });
    await sit(url, 'host');
    await sit(url, 'alice');
    const response = await share(url, 'alice', png(5, 5));
    expect(response.status).toBe(503);
  });

  it('keeps profile images out of the public uploads folder', async () => {
    const url = await start();
    await sit(url, 'host');
    await sit(url, 'alice');
    const image = await shareOk(url, 'alice', png(5, 5));
    expect(fs.existsSync(path.join(profilesDir, `${image.id}.png`))).toBe(true);
    for (const guess of [
      `/uploads/${image.id}.png`,
      `/uploads/images/${image.id}.png`,
      `/uploads/../tables/profiles/${image.id}.png`,
    ]) {
      expect((await fetch(`${url}${guess}`)).status).toBe(404);
    }
  });
});
