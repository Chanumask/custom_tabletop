import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type PlayerColorId,
  type SceneUpdateResponse,
  type SessionJoinResponse,
  type TablePingRequest,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { parseSceneUpdateRequest, parseTablePingRequest } from './validation.js';

describe('grid and ping parsing', () => {
  const base = { sessionId: 's', playerId: 'p', sceneId: 'default' };

  it('accepts only the offered grid sizes', () => {
    expect(parseSceneUpdateRequest({ ...base, gridCells: 20 })?.gridCells).toBe(20);
    expect(parseSceneUpdateRequest({ ...base, gridCells: 0 })?.gridCells).toBe(0);
    expect(parseSceneUpdateRequest({ ...base, gridCells: 7 })).toBeNull();
    expect(parseSceneUpdateRequest({ ...base, gridCells: '20' })).toBeNull();
  });

  it('needs a real point to ping', () => {
    expect(parseTablePingRequest({ sessionId: 's', playerId: 'p', point: { x: 1, y: 2 } })).toEqual(
      { sessionId: 's', playerId: 'p', point: { x: 1, y: 2 } },
    );
    expect(parseTablePingRequest({ sessionId: 's', playerId: 'p', point: { x: 1 } })).toBeNull();
    expect(
      parseTablePingRequest({ sessionId: 's', playerId: 'p', point: { x: NaN, y: 0 } }),
    ).toBeNull();
  });
});

describe('table:ping and the map grid (socket)', () => {
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

  async function player(sessionId: string, playerId: string, color: PlayerColorId) {
    const client = ioClient(url, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));
    const joined = await new Promise<SessionJoinResponse>((resolve) =>
      client.emit(
        SocketEvent.SessionJoin,
        { sessionId, playerId, playerName: playerId, playerToken: `t-${playerId}`, color },
        resolve,
      ),
    );
    if (!joined.ok) throw new Error(joined.error);
    return client;
  }

  /** Collects pings a client receives for a short while. */
  function pingsTo(client: ClientSocket, ms = 150): Promise<TablePingRequest[]> {
    const seen: TablePingRequest[] = [];
    const handler = (ping: TablePingRequest) => seen.push(ping);
    client.on(SocketEvent.TablePing, handler);
    return new Promise((resolve) =>
      setTimeout(() => {
        client.off(SocketEvent.TablePing, handler);
        resolve(seen);
      }, ms),
    );
  }

  it('shows a ping to everyone else, once per burst, and never for a forged sender', async () => {
    const alice = await player('ping-1', 'alice', 'red');
    const bob = await player('ping-1', 'bob', 'blue');
    const carol = await player('ping-1', 'carol', 'green');

    const [toAlice, toBob, toCarol] = [pingsTo(alice), pingsTo(bob), pingsTo(carol)];
    const ping = { sessionId: 'ping-1', playerId: 'alice', point: { x: 300, y: 420 } };
    alice.emit(SocketEvent.TablePing, ping);
    alice.emit(SocketEvent.TablePing, { ...ping, point: { x: 1, y: 1 } }); // too soon
    bob.emit(SocketEvent.TablePing, { ...ping, point: { x: 9, y: 9 } }); // bob posing as alice

    expect(await toAlice).toEqual([]);
    expect(await toBob).toEqual([ping]);
    expect(await toCarol).toEqual([ping]);
  });

  it('lets the host lay a grid over the map, and nobody else', async () => {
    const alice = await player('grid-1', 'alice', 'red');
    const bob = await player('grid-1', 'bob', 'blue');
    const update = (client: ClientSocket, playerId: string, gridCells: number) =>
      new Promise<SceneUpdateResponse>((resolve) =>
        client.emit(
          SocketEvent.SceneUpdate,
          { sessionId: 'grid-1', playerId, sceneId: 'default', gridCells },
          resolve,
        ),
      );

    const hosted = await update(alice, 'alice', 20);
    expect(hosted.ok && hosted.state.scenes[0]!.gridCells).toBe(20);
    expect((await update(bob, 'bob', 10)).ok).toBe(false);
  });
});
