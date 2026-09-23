import cors from 'cors';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import {
  ConnectionEvent,
  SocketEvent,
  type SessionJoinResponse,
  type SessionLeaveResponse,
} from '@custom-tabletop/shared';
import { SessionStore } from './sessionStore.js';
import {
  parseSessionJoinRequest,
  parseSessionLeaveRequest,
  parsePlayerMoveRequest,
} from './validation.js';

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

  const sessions = new SessionStore();

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on(ConnectionEvent.Ping, (payload: unknown) => {
      socket.emit(ConnectionEvent.Pong, payload);
    });

    socket.on(
      SocketEvent.SessionJoin,
      (payload: unknown, ack?: (response: SessionJoinResponse) => void) => {
        const request = parseSessionJoinRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and playerName are required.' });
          return;
        }

        const state = sessions.join(request.sessionId, request.playerId, request.playerName);
        socket.join(request.sessionId);

        ack?.({ ok: true, state });
        io.to(request.sessionId).emit(SocketEvent.SessionState, state);
      },
    );

    socket.on(
      SocketEvent.SessionLeave,
      (payload: unknown, ack?: (response: SessionLeaveResponse) => void) => {
        const request = parseSessionLeaveRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId and playerId are required.' });
          return;
        }

        const state = sessions.leave(request.sessionId, request.playerId);
        socket.leave(request.sessionId);
        ack?.({ ok: true });

        if (state) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, state);
        }
      },
    );

    // No ack, no full-state broadcast: this fires many times a second while
    // a player walks, so it's rebroadcast as the same lightweight delta to
    // everyone else in the session (docs/engineering/architecture.md,
    // "Performance") rather than round-tripped or folded into session:state.
    socket.on(SocketEvent.PlayerMove, (payload: unknown) => {
      const request = parsePlayerMoveRequest(payload);
      if (!request) {
        return;
      }

      const moved = sessions.move(
        request.sessionId,
        request.playerId,
        request.position,
        request.rotationY,
      );
      if (moved) {
        socket.to(request.sessionId).emit(SocketEvent.PlayerMove, request);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
      // No session cleanup here, by design: a dropped connection keeps its
      // Player record in the session so the same identity (a client-side
      // playerId) can rejoin later without creating a duplicate. See
      // docs/decisions.md ("disconnect vs. explicit leave").
    });
  });

  return { http, io };
}
