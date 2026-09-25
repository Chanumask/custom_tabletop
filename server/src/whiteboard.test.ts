import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  WHITEBOARD_LINE_COUNT,
  type PlayerColorId,
  type SessionJoinResponse,
  type WhiteboardWriteResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { SessionStore } from './sessionStore.js';
import { parseWhiteboardWriteRequest } from './validation.js';
import { waitForState } from './testSupport.js';

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

function join(client: ClientSocket, sessionId: string, playerId: string, color: PlayerColorId) {
  return new Promise<SessionJoinResponse>((resolve) =>
    client.emit(
      SocketEvent.SessionJoin,
      { sessionId, playerId, playerName: playerId, playerToken: `token-${playerId}`, color },
      resolve,
    ),
  );
}

function lines(...texts: string[]): string[] {
  return Array.from({ length: WHITEBOARD_LINE_COUNT }, (_, index) => texts[index] ?? '');
}

/** A save that only touches some lines: `{ 2: 'text' }`, null elsewhere. */
function edits(changes: Record<number, string>): (string | null)[] {
  return Array.from({ length: WHITEBOARD_LINE_COUNT }, (_, index) => changes[index] ?? null);
}

function write(client: ClientSocket, sessionId: string, playerId: string, text: (string | null)[]) {
  return new Promise<WhiteboardWriteResponse>((resolve) =>
    client.emit(SocketEvent.WhiteboardWrite, { sessionId, playerId, lines: text }, resolve),
  );
}

describe('SessionStore.writeWhiteboard', () => {
  it('attributes only changed lines to the writer, and clears the author with the text', () => {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice', undefined, 'red');
    store.join('abc', 'bob', 'Bob', undefined, 'blue');

    store.writeWhiteboard('abc', 'alice', lines('Goblins: 3', 'Initiative: Bob'));
    const result = store.writeWhiteboard('abc', 'bob', lines('Goblins: 3', 'Initiative: Alice'));
    if (!result.ok) throw new Error(result.error);

    expect(result.state.whiteboard[0]).toEqual({
      text: 'Goblins: 3',
      authorId: 'alice',
      color: 'red',
    });
    expect(result.state.whiteboard[1]).toEqual({
      text: 'Initiative: Alice',
      authorId: 'bob',
      color: 'blue',
    });

    const cleared = store.writeWhiteboard('abc', 'bob', lines('', 'Initiative: Alice'));
    expect(cleared.ok && cleared.state.whiteboard[0]).toEqual({
      text: '',
      authorId: null,
      color: null,
    });
  });

  it("leaves untouched (null) lines alone, so a concurrent writer's line survives", () => {
    const store = new SessionStore();
    store.join('abc', 'alice', 'Alice', undefined, 'red');
    store.join('abc', 'bob', 'Bob', undefined, 'blue');

    // Both opened the editor on an empty board; Bob saves first.
    store.writeWhiteboard('abc', 'bob', edits({ 2: 'Bob was here' }));
    const result = store.writeWhiteboard('abc', 'alice', edits({ 0: 'Alice was here' }));
    if (!result.ok) throw new Error(result.error);

    expect(result.state.whiteboard.map((line) => [line.text, line.authorId])).toEqual([
      ['Alice was here', 'alice'],
      ['', null],
      ['Bob was here', 'bob'],
      ['', null],
      ['', null],
      ['', null],
    ]);
  });

  it('starts empty', () => {
    const store = new SessionStore();
    const state = store.join('abc', 'alice', 'Alice');
    expect(state.whiteboard).toHaveLength(WHITEBOARD_LINE_COUNT);
    expect(state.whiteboard.every((line) => line.text === '' && line.authorId === null)).toBe(true);
  });
});

describe('parseWhiteboardWriteRequest', () => {
  const base = { sessionId: 'a', playerId: 'p' };

  it('turns control characters into spaces and trims trailing space', () => {
    const parsed = parseWhiteboardWriteRequest({ ...base, lines: lines('a\tb\nc   ') });
    expect(parsed?.lines[0]).toBe('a b c');
  });

  it('passes untouched (null) lines through', () => {
    const parsed = parseWhiteboardWriteRequest({ ...base, lines: edits({ 1: 'hi  ' }) });
    expect(parsed?.lines).toEqual([null, 'hi', null, null, null, null]);
  });

  it.each([
    [{ ...base, lines: ['too', 'few'] }],
    [{ ...base, lines: edits({ 3: 'x'.repeat(43) }) }],
    [{ ...base, lines: lines('x'.repeat(43)) }],
    [{ ...base, lines: [...lines(), 7] }],
    [{ ...base, lines: 'not an array' }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseWhiteboardWriteRequest(payload)).toBeNull();
  });
});

describe('whiteboard:write (socket)', () => {
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

  async function connected() {
    const client = await connect(url);
    clients.push(client);
    return client;
  }

  it('shows everyone the same board, each line in its writer’s color', async () => {
    const alice = await connected();
    const bob = await connected();
    const carol = await connected();
    await join(alice, 'wb-1', 'alice', 'red');
    await join(bob, 'wb-1', 'bob', 'green');
    await join(carol, 'wb-1', 'carol', 'purple');

    const carolSees = waitForState(carol, (state) => Boolean(state.whiteboard[1]?.text));

    expect((await write(alice, 'wb-1', 'alice', lines('Quest: find the key'))).ok).toBe(true);
    expect(
      (await write(bob, 'wb-1', 'bob', lines('Quest: find the key', 'Bob owes 5 gold'))).ok,
    ).toBe(true);

    const state = await carolSees;
    expect(state.whiteboard.slice(0, 2)).toEqual([
      { text: 'Quest: find the key', authorId: 'alice', color: 'red' },
      { text: 'Bob owes 5 gold', authorId: 'bob', color: 'green' },
    ]);
  });

  it('two players saving different lines at once both land', async () => {
    const alice = await connected();
    const bob = await connected();
    const carol = await connected();
    await join(alice, 'wb-3', 'alice', 'red');
    await join(bob, 'wb-3', 'bob', 'green');
    await join(carol, 'wb-3', 'carol', 'purple');

    const carolSees = waitForState(carol, (state) =>
      Boolean(state.whiteboard[0]?.text && state.whiteboard[5]?.text),
    );

    const results = await Promise.all([
      write(alice, 'wb-3', 'alice', edits({ 0: 'Round 2' })),
      write(bob, 'wb-3', 'bob', edits({ 5: 'Bob: 12 HP' })),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);

    const state = await carolSees;
    expect(state.whiteboard[0]).toEqual({ text: 'Round 2', authorId: 'alice', color: 'red' });
    expect(state.whiteboard[5]).toEqual({ text: 'Bob: 12 HP', authorId: 'bob', color: 'green' });
  });

  it('rejects a forged writer and an over-long line', async () => {
    const alice = await connected();
    const bob = await connected();
    await join(alice, 'wb-2', 'alice', 'red');
    await join(bob, 'wb-2', 'bob', 'green');

    expect(await write(bob, 'wb-2', 'alice', lines('forged'))).toEqual({
      ok: false,
      error: 'Not joined to this session as that player.',
    });
    expect((await write(bob, 'wb-2', 'bob', lines('x'.repeat(60)))).ok).toBe(false);
  });
});
