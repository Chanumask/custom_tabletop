import cors from 'cors';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import { ConnectionEvent } from '@custom-tabletop/shared';

export interface AppServer {
  http: HttpServer;
  io: SocketIoServer;
}

/**
 * Builds (but does not start listening on) the Express + Socket.IO server.
 * Split out from src/index.ts so tests can spin up a real server on an
 * ephemeral port instead of mocking the transport.
 */
export function createAppServer(): AppServer {
  const app = express();
  app.use(cors());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const http = createServer(app);
  const io = new SocketIoServer(http, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on(ConnectionEvent.Ping, (payload: unknown) => {
      socket.emit(ConnectionEvent.Pong, payload);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    });
  });

  return { http, io };
}
