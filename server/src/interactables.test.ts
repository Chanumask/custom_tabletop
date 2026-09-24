import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type ObjectInteractResponse,
} from '@custom-tabletop/shared';
import { withTestToken } from './testSupport.js';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) =>
    client.emit(SocketEvent.SessionJoin, withTestToken(payload), resolve),
  );
}

function interactAck(client: ClientSocket, payload: unknown): Promise<ObjectInteractResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.ObjectInteract, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('Room interactables (Milestone 8 exit check)', () => {
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

  it('a fresh session starts with the light on', async () => {
    const alice = await connect(url);
    clients.push(alice);
    const joined = await joinAck(alice, {
      sessionId: 'room-1',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.state.lightOn).toBe(true);
    expect(joined.state.players[0]?.seated).toBe(false);
  });

  it('one player toggling the light is seen live by another player, and can be toggled back', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'room-2', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'room-2', playerId: 'bob-id', playerName: 'Bob' });
    // Drain Bob's own join broadcast before listening for the next one —
    // same pattern used elsewhere in this suite for a reason (see
    // soundAndMute.test.ts).
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesTheLightFlip = new Promise((resolve) =>
      alice.once(SocketEvent.SessionState, resolve),
    );

    // Bob, not the host, flips the light off — not host-gated.
    const offResult = await interactAck(bob, {
      sessionId: 'room-2',
      playerId: 'bob-id',
      objectId: 'light',
    });
    expect(offResult.ok).toBe(true);
    if (!offResult.ok) return;
    expect(offResult.state.lightOn).toBe(false);

    const broadcast = (await aliceSeesTheLightFlip) as { lightOn: boolean };
    expect(broadcast.lightOn).toBe(false);

    const onResult = await interactAck(bob, {
      sessionId: 'room-2',
      playerId: 'bob-id',
      objectId: 'light',
    });
    expect(onResult.ok).toBe(true);
    if (!onResult.ok) return;
    expect(onResult.state.lightOn).toBe(true);
  });

  it('a player sitting at the table only changes their own seated status, seen live by everyone, and can stand back up', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'room-3', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'room-3', playerId: 'bob-id', playerName: 'Bob' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesBobSitDown = new Promise((resolve) =>
      alice.once(SocketEvent.SessionState, resolve),
    );

    const sitResult = await interactAck(bob, {
      sessionId: 'room-3',
      playerId: 'bob-id',
      objectId: 'table',
    });
    expect(sitResult.ok).toBe(true);
    if (!sitResult.ok) return;
    expect(sitResult.state.players.find((p) => p.id === 'bob-id')?.seated).toBe(true);
    expect(sitResult.state.players.find((p) => p.id === 'alice-id')?.seated).toBe(false);

    const broadcast = (await aliceSeesBobSitDown) as {
      players: { id: string; seated: boolean }[];
    };
    expect(broadcast.players.find((p) => p.id === 'bob-id')?.seated).toBe(true);

    const standResult = await interactAck(bob, {
      sessionId: 'room-3',
      playerId: 'bob-id',
      objectId: 'table',
    });
    expect(standResult.ok).toBe(true);
    if (!standResult.ok) return;
    expect(standResult.state.players.find((p) => p.id === 'bob-id')?.seated).toBe(false);
  });

  it('rejects an unrecognized objectId, and a malformed payload, without crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'room-4', playerId: 'alice-id', playerName: 'Alice' });

    const unknown = await interactAck(alice, {
      sessionId: 'room-4',
      playerId: 'alice-id',
      objectId: 'teapot',
    });
    expect(unknown).toEqual({ ok: false, error: 'Unknown interactable.' });

    const malformed = await interactAck(alice, { sessionId: 'room-4', playerId: 'alice-id' });
    expect(malformed.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await interactAck(alice, {
      sessionId: 'room-4',
      playerId: 'alice-id',
      objectId: 'light',
    });
    expect(followUp.ok).toBe(true);
  });
});
