import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SESSION_ENDED_ERROR,
  SocketEvent,
  TABLE_WAITING_FOR_HOST_ERROR,
  type SessionHostKey,
  type SessionJoinResponse,
  type SessionPeekResponse,
  type SessionTransferHostResponse,
  type WhiteboardWriteResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer, type AppServerOptions } from './server.js';

// Saved tables end to end (docs/decisions.md, "Saved tables"): real servers
// sharing one tables folder, "restarted" by closing one and starting
// another on the same folder.

const GRACE_MS = 150;
let dir: string;
let servers: AppServer[];
let clients: ClientSocket[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saved-tables-'));
  servers = [];
  clients = [];
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  for (const server of servers) await stop(server);
  fs.rmSync(dir, { recursive: true, force: true });
});

async function start(
  options: Partial<AppServerOptions> = {},
): Promise<{ app: AppServer; url: string }> {
  const app = createAppServer({ tablesDir: dir, disconnectGraceMs: GRACE_MS, ...options });
  servers.push(app);
  await new Promise<void>((resolve) => app.http.listen(0, () => resolve()));
  const address = app.http.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { app, url: `http://localhost:${address.port}` };
}

async function stop(app: AppServer): Promise<void> {
  if (!app.http.listening) return;
  app.io.close();
  await new Promise<void>((resolve) => app.http.close(() => resolve()));
}

async function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  return client;
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

function join(
  client: ClientSocket,
  sessionId: string,
  playerId: string,
  extra: { hostKey?: string; resume?: boolean; token?: string } = {},
): Promise<SessionJoinResponse> {
  return emitAck(client, SocketEvent.SessionJoin, {
    sessionId,
    playerId,
    playerName: playerId,
    playerToken: extra.token ?? `token-${playerId}`,
    ...(extra.hostKey ? { hostKey: extra.hostKey } : {}),
    ...(extra.resume ? { resume: true } : {}),
  });
}

function writeBoard(client: ClientSocket, sessionId: string, playerId: string, text: string) {
  return emitAck<WhiteboardWriteResponse>(client, SocketEvent.WhiteboardWrite, {
    sessionId,
    playerId,
    lines: [text, null, null, null, null, null],
  });
}

function peek(client: ClientSocket, sessionId: string): Promise<SessionPeekResponse> {
  return emitAck(client, SocketEvent.SessionPeek, { sessionId });
}

const boardText = (response: SessionJoinResponse) =>
  response.ok ? response.state.whiteboard[0]!.text : null;

describe('a table survives a restart', () => {
  it('comes back with its players away; they rejoin as themselves and play on', async () => {
    const first = await start();
    const alice = await connect(first.url);
    const bob = await connect(first.url);
    expect((await join(alice, 'CRYPT', 'alice')).ok).toBe(true);
    expect((await join(bob, 'CRYPT', 'bob')).ok).toBe(true);
    expect((await writeBoard(alice, 'CRYPT', 'alice', 'Session 3: the crypt')).ok).toBe(true);

    await stop(first.app); // shutting down saves every table in play

    const second = await start();
    const observer = await connect(second.url);
    const seen = await peek(observer, 'CRYPT');
    expect(seen).toMatchObject({ exists: true, playerCount: 2 });
    expect(seen.saved).toBeUndefined(); // in play, not waiting for its host

    // The reconnect path: same ids, same tokens, `resume`.
    const aliceAgain = await connect(second.url);
    const rejoined = await join(aliceAgain, 'CRYPT', 'alice', { resume: true });
    expect(boardText(rejoined)).toBe('Session 3: the crypt');
    expect(rejoined.ok && rejoined.state.hostId).toBe('alice');
    expect(rejoined.ok && rejoined.hostKey).toBeTruthy();

    // Nobody else can claim a restored player: tokens are checked (by hash).
    const impostor = await connect(second.url);
    const claimed = await join(impostor, 'CRYPT', 'bob', { token: 'guessed' });
    expect(claimed).toEqual({ ok: false, error: 'That player identity belongs to someone else.' });
  });

  it('players who never come back are removed after the grace period', async () => {
    const first = await start();
    const alice = await connect(first.url);
    await join(alice, 'CRYPT', 'alice');
    await stop(first.app);

    const second = await start();
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS * 3));
    const observer = await connect(second.url);
    // Everyone gone: the table is now saved, waiting for its host.
    expect(await peek(observer, 'CRYPT')).toMatchObject({ exists: true, saved: true });
  });
});

describe('a table everyone has left', () => {
  async function hostAndLeave(url: string) {
    const alice = await connect(url);
    const joined = await join(alice, 'CRYPT', 'alice');
    if (!joined.ok || !joined.hostKey) throw new Error('host got no key');
    await writeBoard(alice, 'CRYPT', 'alice', 'Loot: 240 gp');
    await emitAck(alice, SocketEvent.SessionLeave, { sessionId: 'CRYPT', playerId: 'alice' });
    return joined.hostKey;
  }

  it('is kept, and says so to the join screen', async () => {
    const { url } = await start();
    await hostAndLeave(url);
    const observer = await connect(url);
    const seen = await peek(observer, 'CRYPT');
    expect(seen).toMatchObject({ exists: true, saved: true, playerCount: 0, hostName: 'alice' });
    expect(seen.lastActiveAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it('refuses anyone without the host key, fresh join or reconnect alike', async () => {
    const { url } = await start();
    await hostAndLeave(url);
    const stranger = await connect(url);
    expect(await join(stranger, 'CRYPT', 'mallory')).toEqual({
      ok: false,
      error: TABLE_WAITING_FOR_HOST_ERROR,
    });
    expect(await join(stranger, 'CRYPT', 'mallory', { hostKey: 'wrong-key' })).toEqual({
      ok: false,
      error: TABLE_WAITING_FOR_HOST_ERROR,
    });
    // An old tab auto-rejoining is refused the same way (no "ended").
    const oldTab = await connect(url);
    expect(await join(oldTab, 'CRYPT', 'alice', { resume: true })).toEqual({
      ok: false,
      error: TABLE_WAITING_FOR_HOST_ERROR,
    });
  });

  it('reopens exactly as it was for whoever brings the host key, from any device', async () => {
    const { url } = await start();
    const hostKey = await hostAndLeave(url);
    // A different "device": a new player id and token, only the key.
    const laptop = await connect(url);
    const reopened = await join(laptop, 'CRYPT', 'alice-laptop', { hostKey });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.state.whiteboard[0]!.text).toBe('Loot: 240 gp');
    expect(reopened.state.hostId).toBe('alice-laptop');
    expect(reopened.hostKey).toBe(hostKey);
    expect(JSON.stringify(reopened.state.log)).toContain('alice-laptop reopened the table');

    // In play again: others join normally.
    const bob = await connect(url);
    const bobJoined = await join(bob, 'CRYPT', 'bob');
    expect(bobJoined.ok).toBe(true);
    expect(bobJoined.ok && bobJoined.hostKey).toBeUndefined(); // not the host
  });

  it('survives a restart while nobody is at it', async () => {
    const first = await start();
    const hostKey = await hostAndLeave(first.url);
    await stop(first.app);
    const second = await start();
    const alice = await connect(second.url);
    expect(boardText(await join(alice, 'CRYPT', 'alice2', { hostKey }))).toBe('Loot: 240 gp');
  });

  it('expires after the saved-table lifetime', async () => {
    const first = await start({ archivePolicy: { ttlMs: 0, maxTables: 500, maxBytes: 1e9 } });
    await hostAndLeave(first.url);
    await stop(first.app);
    // Past its lifetime: the next start's sweep removes it.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await start({ archivePolicy: { ttlMs: 0, maxTables: 500, maxBytes: 1e9 } });
    const observer = await connect(second.url);
    expect(await peek(observer, 'CRYPT')).toMatchObject({ exists: false });
    const alice = await connect(second.url);
    const again = await join(alice, 'CRYPT', 'alice', { resume: true });
    expect(again).toEqual({ ok: false, error: SESSION_ENDED_ERROR });
  });
});

describe('the host key stays with the host', () => {
  it('goes privately to a new host on handover, never to anyone else', async () => {
    const { url } = await start();
    const alice = await connect(url);
    const bob = await connect(url);
    const carol = await connect(url);
    const aliceJoined = await join(alice, 'CRYPT', 'alice');
    await join(bob, 'CRYPT', 'bob');
    await join(carol, 'CRYPT', 'carol');
    const hostKey = aliceJoined.ok ? aliceJoined.hostKey : undefined;

    const received: Record<string, SessionHostKey[]> = { bob: [], carol: [] };
    bob.on(SocketEvent.SessionHostKey, (message: SessionHostKey) => received.bob!.push(message));
    carol.on(SocketEvent.SessionHostKey, (message: SessionHostKey) =>
      received.carol!.push(message),
    );

    const transfer = await emitAck<SessionTransferHostResponse>(
      alice,
      SocketEvent.SessionTransferHost,
      { sessionId: 'CRYPT', playerId: 'alice', targetPlayerId: 'bob' },
    );
    expect(transfer.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received.bob).toEqual([{ sessionId: 'CRYPT', hostKey }]);
    expect(received.carol).toEqual([]);
  });

  it('goes to the successor when the host leaves', async () => {
    const { url } = await start();
    const alice = await connect(url);
    const bob = await connect(url);
    await join(alice, 'CRYPT', 'alice');
    await join(bob, 'CRYPT', 'bob');
    const got = new Promise<SessionHostKey>((resolve) =>
      bob.once(SocketEvent.SessionHostKey, resolve),
    );
    await emitAck(alice, SocketEvent.SessionLeave, { sessionId: 'CRYPT', playerId: 'alice' });
    expect((await got).sessionId).toBe('CRYPT');
  });
});
