import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { ConnectionEvent } from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

describe('WebSocket round trip (Milestone 1 exit check)', () => {
  let app: AppServer;
  let url: string;
  let client: ClientSocket;

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
  });

  afterEach(async () => {
    client?.disconnect();
    app.io.close();
    await new Promise<void>((resolve) => app.http.close(() => resolve()));
  });

  it('echoes a ping back as a pong over a real socket connection', async () => {
    client = ioClient(url, { transports: ['websocket'] });

    const pong = new Promise((resolve) => {
      client.on(ConnectionEvent.Pong, resolve);
    });

    await new Promise<void>((resolve) => client.on('connect', () => resolve()));
    client.emit(ConnectionEvent.Ping, { hello: 'client' });

    await expect(pong).resolves.toEqual({ hello: 'client' });
  });
});
