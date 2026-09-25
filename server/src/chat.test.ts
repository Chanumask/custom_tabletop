import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  MAX_LOG_ENTRIES,
  SocketEvent,
  parseDiceNotation,
  type ChatSendResponse,
  type LogEntry,
  type LogEntryBroadcast,
  type PlayerColorId,
  type SessionJoinResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';
import { parseChatSendRequest } from './validation.js';

describe('SessionStore log', () => {
  it('records arrivals, departures, renames and host changes', () => {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice', undefined, 'red');
    store.join('abc', 'bob', 'Bob', undefined, 'blue');
    store.join('abc', 'bob', 'Bob'); // a rejoin isn't news
    store.updateProfile('abc', 'bob', { name: 'Robert' });
    const state = store.leave('abc', 'alice')!;

    expect(state.log.map((entry) => entry.kind === 'system' && entry.text)).toEqual([
      'Alice opened the table',
      'Bob joined the table',
      'Bob is now called Robert',
      'Alice left the table',
      'Robert is now the host',
    ]);
  });

  it('logs a roll of table dice as one entry with its total', () => {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice');
    store.spawnDice('abc', 'alice', 'a', { x: 0, y: 0, z: 0 }, 'd20');
    store.spawnDice('abc', 'alice', 'b', { x: 0, y: 0, z: 0 }, 'd6');

    const result = store.rollDice('abc', ['a', 'b'], 'alice', () => 0.5);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.log.at(-1)).toMatchObject({
      kind: 'roll',
      playerId: 'alice',
      dice: [
        { sides: 20, result: 11 },
        { sides: 6, result: 4 },
      ],
      modifier: 0,
      total: 15,
    });
  });

  it('rolls typed notation server-side, subtracting negative groups', () => {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice');
    const notation = parseDiceNotation('2d6-1d4+3')!;

    const result = store.rollNotation('abc', 'alice', notation, () => 0.99);
    if (!result.ok) throw new Error(result.error);
    expect(result.entry).toMatchObject({
      kind: 'roll',
      notation: '2d6-1d4+3',
      dice: [
        { sides: 6, result: 6 },
        { sides: 6, result: 6 },
        { sides: 4, result: 4, subtract: true },
      ],
      modifier: 3,
      total: 11,
    });
  });

  it('keeps only the most recent entries', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'alice', 'Alice');
    for (let i = 0; i < MAX_LOG_ENTRIES + 10; i++) {
      store.chat('abc', 'alice', `line ${i}`);
    }
    expect(state.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(state.log.at(-1)).toMatchObject({ kind: 'chat', text: `line ${MAX_LOG_ENTRIES + 9}` });
  });

  it('refuses chat from someone not at the table', () => {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice');
    expect(store.chat('abc', 'mallory', 'hi').ok).toBe(false);
  });
});

describe('parseChatSendRequest', () => {
  const base = { sessionId: 'a', playerId: 'p' };

  it('trims and turns control characters into spaces', () => {
    expect(parseChatSendRequest({ ...base, text: '  hi\tthere\n ' })?.text).toBe('hi there');
  });

  it.each([{ ...base, text: '   ' }, { ...base, text: 'x'.repeat(201) }, { ...base }])(
    'rejects %j',
    (payload) => {
      expect(parseChatSendRequest(payload)).toBeNull();
    },
  );
});

describe('chat:send (socket)', () => {
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

  async function connect() {
    const client = ioClient(url, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));
    return client;
  }

  function join(client: ClientSocket, sessionId: string, playerId: string, color?: PlayerColorId) {
    return new Promise<SessionJoinResponse>((resolve) =>
      client.emit(
        SocketEvent.SessionJoin,
        { sessionId, playerId, playerName: playerId, playerToken: `t-${playerId}`, color },
        resolve,
      ),
    );
  }

  async function player(sessionId: string, playerId: string, color: PlayerColorId) {
    const client = await connect();
    const joined = await join(client, sessionId, playerId, color);
    if (!joined.ok) throw new Error(joined.error);
    return client;
  }

  const send = (client: ClientSocket, sessionId: string, playerId: string, text: string) =>
    new Promise<ChatSendResponse>((resolve) =>
      client.emit(SocketEvent.ChatSend, { sessionId, playerId, text }, resolve),
    );

  const nextEntry = (client: ClientSocket) =>
    new Promise<LogEntry>((resolve) =>
      client.once(SocketEvent.LogEntry, (message: LogEntryBroadcast) => resolve(message.entry)),
    );

  it('delivers a line to every player at the table, sender included', async () => {
    const alice = await player('chat-1', 'alice', 'red');
    const bob = await player('chat-1', 'bob', 'blue');
    const carol = await player('chat-1', 'carol', 'green');

    const received = Promise.all([alice, bob, carol].map(nextEntry));
    expect(await send(alice, 'chat-1', 'alice', 'Roll for initiative!')).toEqual({ ok: true });
    const entries = await received;
    for (const entry of entries) {
      expect(entry).toMatchObject({
        kind: 'chat',
        playerId: 'alice',
        text: 'Roll for initiative!',
      });
    }
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(1);
  });

  it('rolls /roll notation on the server; a bare /roll is a d20', async () => {
    const alice = await player('chat-2', 'alice', 'red');
    const bob = await player('chat-2', 'bob', 'blue');

    const seen = nextEntry(bob);
    expect((await send(alice, 'chat-2', 'alice', '/roll 2d6+3')).ok).toBe(true);
    const roll = await seen;
    if (roll.kind !== 'roll') throw new Error('not a roll');
    expect(roll.notation).toBe('2d6+3');
    expect(roll.total).toBeGreaterThanOrEqual(5);
    expect(roll.total).toBeLessThanOrEqual(15);

    const d20 = nextEntry(bob);
    await send(alice, 'chat-2', 'alice', '/r');
    expect(await d20).toMatchObject({ kind: 'roll', notation: '1d20' });

    expect((await send(alice, 'chat-2', 'alice', '/roll fireball')).ok).toBe(false);
  });

  it('gives a late joiner the recent log', async () => {
    const alice = await player('chat-3', 'alice', 'red');
    await send(alice, 'chat-3', 'alice', 'anyone there?');

    const bob = await connect();
    const joined = await join(bob, 'chat-3', 'bob');
    if (!joined.ok) throw new Error(joined.error);
    expect(
      joined.state.log.map((entry) => (entry.kind === 'system' ? entry.text : entry.kind)),
    ).toEqual(['alice opened the table', 'chat', 'bob joined the table']);
  });

  it('refuses a forged sender and slows down a flood', async () => {
    const alice = await player('chat-4', 'alice', 'red');
    const bob = await player('chat-4', 'bob', 'blue');
    expect(await send(bob, 'chat-4', 'alice', 'I am Alice')).toEqual({
      ok: false,
      error: 'Not joined to this session as that player.',
    });

    const results: ChatSendResponse[] = [];
    for (let i = 0; i < 8; i++) {
      results.push(await send(alice, 'chat-4', 'alice', `spam ${i}`));
    }
    expect(results.filter((result) => result.ok)).toHaveLength(6);
    expect(results.at(-1)).toMatchObject({ ok: false });
  });
});
