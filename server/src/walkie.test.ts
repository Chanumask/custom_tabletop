import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type ItemTakeResponse,
  type WalkieTransmitResponse,
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

function transmitAck(client: ClientSocket, payload: unknown): Promise<WalkieTransmitResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.WalkieTransmit, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('The walkie-talkies (gadgets phase 4 exit check)', () => {
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

  it('rejects transmitting without holding a walkie, and with nobody else on the radio', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'walkie-1', playerId: 'alice-id', playerName: 'Alice' });

    const noWalkie = await transmitAck(alice, {
      sessionId: 'walkie-1',
      playerId: 'alice-id',
      text: 'hello?',
    });
    expect(noWalkie).toEqual({ ok: false, error: 'You need a walkie-talkie.' });

    await takeAck(alice, { sessionId: 'walkie-1', playerId: 'alice-id', itemId: 'walkie-1' });
    const alone = await transmitAck(alice, {
      sessionId: 'walkie-1',
      playerId: 'alice-id',
      text: 'hello?',
    });
    expect(alone).toEqual({ ok: false, error: 'Nobody else is on the radio.' });
  });

  it('reaches the other holder live, but never a third player standing right there', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    const carol = await connect(url);
    clients.push(alice, bob, carol);

    await joinAck(alice, { sessionId: 'walkie-2', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'walkie-2', playerId: 'bob-id', playerName: 'Bob' });
    await joinAck(carol, { sessionId: 'walkie-2', playerId: 'carol-id', playerName: 'Carol' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await takeAck(alice, { sessionId: 'walkie-2', playerId: 'alice-id', itemId: 'walkie-1' });
    await takeAck(bob, { sessionId: 'walkie-2', playerId: 'bob-id', itemId: 'walkie-2' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const bobSeesIt = nextUpdate(bob);
    const carolMessages: unknown[] = [];
    carol.onAny((event, ...args) => carolMessages.push({ event, args }));

    const result = await transmitAck(alice, {
      sessionId: 'walkie-2',
      playerId: 'alice-id',
      text: 'do you copy',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Alice's own ack carries the line (it's addressed to her too).
    const aliceLog = result.state.log;
    expect(aliceLog.some((entry) => entry.kind === 'radio' && entry.text === 'do you copy')).toBe(
      true,
    );

    const broadcast = (await bobSeesIt) as { log?: { kind: string; text: string }[] };
    expect(
      broadcast.log?.some((entry) => entry.kind === 'radio' && entry.text === 'do you copy'),
    ).toBe(true);

    // Give Carol's socket a moment to receive anything it's going to.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const serialized = JSON.stringify(carolMessages);
    expect(serialized).not.toContain('do you copy');

    // A late joiner (Dave, holding nothing) must not get it in their
    // initial snapshot either.
    const dave = await connect(url);
    clients.push(dave);
    const joined = await joinAck(dave, {
      sessionId: 'walkie-2',
      playerId: 'dave-id',
      playerName: 'Dave',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(
      joined.state.log.some((entry) => entry.kind === 'radio' && entry.text === 'do you copy'),
    ).toBe(false);
  });

  it('rejects a malformed payload without crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'walkie-3', playerId: 'alice-id', playerName: 'Alice' });

    const malformed = await transmitAck(alice, { sessionId: 'walkie-3', playerId: 'alice-id' });
    expect(malformed.ok).toBe(false);

    const empty = await transmitAck(alice, {
      sessionId: 'walkie-3',
      playerId: 'alice-id',
      text: '   ',
    });
    expect(empty.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await takeAck(alice, {
      sessionId: 'walkie-3',
      playerId: 'alice-id',
      itemId: 'walkie-1',
    });
    expect(followUp.ok).toBe(true);
  });
});
