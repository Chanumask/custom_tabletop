import cors from 'cors';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import {
  ConnectionEvent,
  SocketEvent,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type SceneCreateResponse,
  type SceneChangeResponse,
  type SceneUpdateResponse,
  type DiceSpawnResponse,
  type DiceRollResponse,
  type DiceRemoveResponse,
  type SoundPlayResponse,
  type PlayerMuteResponse,
  type PlayerUnmuteResponse,
} from '@custom-tabletop/shared';
import { SessionStore } from './sessionStore.js';
import {
  parseSessionJoinRequest,
  parseSessionLeaveRequest,
  parsePlayerMoveRequest,
  parseSceneCreateRequest,
  parseSceneChangeRequest,
  parseSceneUpdateRequest,
  parseDrawingStartRequest,
  parseDrawingUpdateRequest,
  parseDrawingEndRequest,
  parseDrawingDeleteRequest,
  parseDiceSpawnRequest,
  parseDiceRollRequest,
  parseDiceRemoveRequest,
  parseSoundPlayRequest,
  parsePlayerMuteRequest,
  parsePlayerUnmuteRequest,
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

    // Infrequent, host-gated, full-state ack + broadcast — same pattern as
    // session:join/leave (unlike player:move/drawing:*, which fire too
    // often for either).
    socket.on(
      SocketEvent.SceneCreate,
      (payload: unknown, ack?: (response: SceneCreateResponse) => void) => {
        const request = parseSceneCreateRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, sceneId, and name are required.' });
          return;
        }

        const result = sessions.createScene(
          request.sessionId,
          request.playerId,
          request.sceneId,
          request.name,
          request.backgroundImage,
        );
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    socket.on(
      SocketEvent.SceneChange,
      (payload: unknown, ack?: (response: SceneChangeResponse) => void) => {
        const request = parseSceneChangeRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and sceneId are required.' });
          return;
        }

        const result = sessions.changeScene(request.sessionId, request.playerId, request.sceneId);
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    socket.on(
      SocketEvent.SceneUpdate,
      (payload: unknown, ack?: (response: SceneUpdateResponse) => void) => {
        const request = parseSceneUpdateRequest(payload);
        if (!request) {
          ack?.({
            ok: false,
            error: 'sessionId, playerId, sceneId, and at least one field to update are required.',
          });
          return;
        }

        const result = sessions.updateScene(request.sessionId, request.playerId, request.sceneId, {
          name: request.name,
          backgroundImage: request.backgroundImage,
        });
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    // Fire-and-forget, no ack, no full-state broadcast — same pattern as
    // player:move and for the same reason (docs/engineering/architecture.md,
    // "Performance"). Not host-gated: any player can draw.
    socket.on(SocketEvent.DrawingStart, (payload: unknown) => {
      const request = parseDrawingStartRequest(payload);
      if (!request) {
        return;
      }

      const started = sessions.startDrawing(
        request.sessionId,
        request.sceneId,
        request.drawingId,
        request.playerId,
        request.point,
      );
      if (started) {
        socket.to(request.sessionId).emit(SocketEvent.DrawingStart, request);
      }
    });

    socket.on(SocketEvent.DrawingUpdate, (payload: unknown) => {
      const request = parseDrawingUpdateRequest(payload);
      if (!request) {
        return;
      }

      const updated = sessions.appendDrawingPoint(
        request.sessionId,
        request.drawingId,
        request.point,
      );
      if (updated) {
        socket.to(request.sessionId).emit(SocketEvent.DrawingUpdate, request);
      }
    });

    socket.on(SocketEvent.DrawingEnd, (payload: unknown) => {
      const request = parseDrawingEndRequest(payload);
      if (!request || !sessions.get(request.sessionId)) {
        return;
      }

      socket.to(request.sessionId).emit(SocketEvent.DrawingEnd, request);
    });

    socket.on(SocketEvent.DrawingDelete, (payload: unknown) => {
      const request = parseDrawingDeleteRequest(payload);
      if (!request) {
        return;
      }

      const deleted = sessions.deleteDrawing(request.sessionId, request.sceneId, request.drawingId);
      if (deleted) {
        socket.to(request.sessionId).emit(SocketEvent.DrawingDelete, request);
      }
    });

    // Infrequent, full-state ack + broadcast — same pattern as scene:*, but
    // not host-gated: any player can spawn/roll/remove a die (the M6 exit
    // check is explicit about this). The roll result is decided in
    // sessions.rollDice, server-side, never trusted from the client.
    socket.on(
      SocketEvent.DiceSpawn,
      (payload: unknown, ack?: (response: DiceSpawnResponse) => void) => {
        const request = parseDiceSpawnRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, diceId, and position are required.' });
          return;
        }

        const result = sessions.spawnDice(
          request.sessionId,
          request.playerId,
          request.diceId,
          request.position,
        );
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    socket.on(
      SocketEvent.DiceRoll,
      (payload: unknown, ack?: (response: DiceRollResponse) => void) => {
        const request = parseDiceRollRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and diceId are required.' });
          return;
        }

        const result = sessions.rollDice(request.sessionId, request.diceId);
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    socket.on(
      SocketEvent.DiceRemove,
      (payload: unknown, ack?: (response: DiceRemoveResponse) => void) => {
        const request = parseDiceRemoveRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and diceId are required.' });
          return;
        }

        const result = sessions.removeDice(request.sessionId, request.diceId);
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    // Host-only. No persisted state to broadcast back (playing a sound
    // doesn't change the session), so unlike scene:*/dice:* this just
    // relays the same payload to everyone in the session, sender included —
    // there's no local optimistic playback to avoid double-triggering, the
    // way there is for drawing:*/player:move.
    socket.on(
      SocketEvent.SoundPlay,
      (payload: unknown, ack?: (response: SoundPlayResponse) => void) => {
        const request = parseSoundPlayRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and soundId are required.' });
          return;
        }
        if (!sessions.get(request.sessionId)) {
          ack?.({ ok: false, error: 'Session not found.' });
          return;
        }
        if (!sessions.isHost(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: 'Only the host can play a sound.' });
          return;
        }

        ack?.({ ok: true });
        io.to(request.sessionId).emit(SocketEvent.SoundPlay, request);
      },
    );

    // A player can always mute/unmute themselves; the host can additionally
    // mute/unmute anyone (see SessionStore.setMuted). Infrequent, full-state
    // ack + broadcast — same pattern as scene:*/dice:*.
    socket.on(
      SocketEvent.PlayerMute,
      (payload: unknown, ack?: (response: PlayerMuteResponse) => void) => {
        const request = parsePlayerMuteRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and targetPlayerId are required.' });
          return;
        }

        const result = sessions.setMuted(
          request.sessionId,
          request.playerId,
          request.targetPlayerId,
          true,
        );
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

    socket.on(
      SocketEvent.PlayerUnmute,
      (payload: unknown, ack?: (response: PlayerUnmuteResponse) => void) => {
        const request = parsePlayerUnmuteRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and targetPlayerId are required.' });
          return;
        }

        const result = sessions.setMuted(
          request.sessionId,
          request.playerId,
          request.targetPlayerId,
          false,
        );
        ack?.(result);
        if (result.ok) {
          io.to(request.sessionId).emit(SocketEvent.SessionState, result.state);
        }
      },
    );

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
