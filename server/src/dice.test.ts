import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type DiceSpawnResponse,
  type DiceRollResponse,
} from '@custom-tabletop/shared';
import { withTestToken } from './testSupport.js';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) =>
    client.emit(SocketEvent.SessionJoin, withTestToken(payload), resolve),
  );
}

function diceSpawnAck(client: ClientSocket, payload: unknown): Promise<DiceSpawnResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.DiceSpawn, payload, resolve));
}

function diceRollAck(client: ClientSocket, payload: unknown): Promise<DiceRollResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.DiceRoll, payload, resolve));
}

function waitForSessionState(client: ClientSocket): Promise<GameState> {
  return new Promise((resolve) => client.once(SocketEvent.SessionState, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('Dice (Milestone 6 exit check)', () => {
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

  it('a spawned and rolled die, and its result, are seen live by another player', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'table-1', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-1', playerId: 'bob-id', playerName: 'Bob' });

    const bobSeesSpawn = waitForSessionState(bob);
    const spawnResult = await diceSpawnAck(alice, {
      sessionId: 'table-1',
      playerId: 'alice-id',
      diceId: 'd1',
      position: { x: 0.1, y: 0.8, z: -0.3 },
    });
    expect(spawnResult.ok).toBe(true);

    const spawnBroadcast = await bobSeesSpawn;
    expect(spawnBroadcast.dice).toEqual([
      { id: 'd1', ownerId: 'alice-id', position: { x: 0.1, y: 0.8, z: -0.3 }, result: null },
    ]);

    const bobSeesRoll = waitForSessionState(bob);
    const rollResult = await diceRollAck(alice, {
      sessionId: 'table-1',
      playerId: 'alice-id',
      diceId: 'd1',
    });
    expect(rollResult.ok).toBe(true);
    if (!rollResult.ok) return;
    const resolvedResult = rollResult.state.dice[0]!.result;
    expect(resolvedResult).toBeGreaterThanOrEqual(1);
    expect(resolvedResult).toBeLessThanOrEqual(6);

    const rollBroadcast = await bobSeesRoll;
    expect(rollBroadcast.dice[0]!.result).toBe(resolvedResult);
  });

  it('a die spawned by one player can be rolled and removed by another (not owner-gated)', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'table-2', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-2', playerId: 'bob-id', playerName: 'Bob' });

    await diceSpawnAck(alice, {
      sessionId: 'table-2',
      playerId: 'alice-id',
      diceId: 'd1',
      position: { x: 0, y: 0.8, z: 0 },
    });

    const bobRolled = await diceRollAck(bob, {
      sessionId: 'table-2',
      playerId: 'bob-id',
      diceId: 'd1',
    });
    expect(bobRolled.ok).toBe(true);

    const bobRemoved = await new Promise((resolve) =>
      bob.emit(
        SocketEvent.DiceRemove,
        { sessionId: 'table-2', playerId: 'bob-id', diceId: 'd1' },
        resolve,
      ),
    );
    expect(bobRemoved).toEqual({ ok: true, state: expect.objectContaining({ dice: [] }) });
  });

  it('a later joiner sees an already-rolled die in their initial session state', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-3', playerId: 'alice-id', playerName: 'Alice' });

    await diceSpawnAck(alice, {
      sessionId: 'table-3',
      playerId: 'alice-id',
      diceId: 'd1',
      position: { x: 0, y: 0.8, z: 0 },
    });
    await diceRollAck(alice, { sessionId: 'table-3', playerId: 'alice-id', diceId: 'd1' });

    const bob = await connect(url);
    clients.push(bob);
    const bobJoined = await joinAck(bob, {
      sessionId: 'table-3',
      playerId: 'bob-id',
      playerName: 'Bob',
    });
    expect(bobJoined.ok).toBe(true);
    if (!bobJoined.ok) return;
    expect(bobJoined.state.dice[0]!.result).not.toBeNull();
  });

  it('rejects a malformed spawn/roll/remove with an error ack instead of crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-4', playerId: 'alice-id', playerName: 'Alice' });

    const badSpawn = await diceSpawnAck(alice, { sessionId: 'table-4', playerId: 'alice-id' });
    expect(badSpawn.ok).toBe(false);

    const badRoll = await diceRollAck(alice, { sessionId: 'table-4', playerId: 'alice-id' });
    expect(badRoll.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await diceSpawnAck(alice, {
      sessionId: 'table-4',
      playerId: 'alice-id',
      diceId: 'd1',
      position: { x: 0, y: 0.8, z: 0 },
    });
    expect(followUp.ok).toBe(true);
  });
});
