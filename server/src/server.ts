import cors from 'cors';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { Server as SocketIoServer, type Socket } from 'socket.io';
import {
  ConnectionEvent,
  MAX_CHAT_LENGTH,
  MAX_DICE_PER_ROLL,
  MAX_PLAYER_NAME_LENGTH,
  parseDiceNotation,
  rollCommand,
  type ChatSendResponse,
  type LogEntryBroadcast,
  MAX_PLAYERS_PER_SESSION,
  SESSION_ENDED_ERROR,
  SocketEvent,
  type PlayerUpdateResponse,
  type SessionPatch,
  type GameState,
  type SessionPeekResponse,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type SessionTransferHostResponse,
  type SceneCreateResponse,
  type SceneChangeResponse,
  type SceneUpdateResponse,
  type DiceSpawnResponse,
  type DiceRollResponse,
  type DiceRemoveResponse,
  type SoundPlayResponse,
  type SoundUploadResponse,
  type SoundboardAssignResponse,
  type SoundRemoveResponse,
  type PlayerMuteResponse,
  type PlayerUnmuteResponse,
  type ObjectInteractResponse,
  type WhiteboardWriteResponse,
  WHITEBOARD_LINE_COUNT,
  WHITEBOARD_MAX_LINE_LENGTH,
} from '@custom-tabletop/shared';
import { SessionStore } from './sessionStore.js';
import {
  parseSessionJoinRequest,
  parseSessionLeaveRequest,
  parseSessionTransferHostRequest,
  parseSessionPeekRequest,
  parsePlayerUpdateRequest,
  parsePlayerMoveRequest,
  parsePlayerEmoteRequest,
  parseSceneCreateRequest,
  parseSceneChangeRequest,
  parseSceneUpdateRequest,
  parseDrawingStartRequest,
  parseDrawingUpdateRequest,
  parseDrawingEndRequest,
  parseDrawingDeleteRequest,
  parseChatSendRequest,
  parseTablePingRequest,
  parseDiceSpawnRequest,
  parseDiceRollRequest,
  parseDiceRemoveRequest,
  parseSoundPlayRequest,
  parseSoundUploadRequest,
  parseSoundboardAssignRequest,
  parseSoundRemoveRequest,
  parsePlayerMuteRequest,
  parsePlayerUnmuteRequest,
  parseObjectInteractRequest,
  parseWhiteboardWriteRequest,
} from './validation.js';
import { registerUploadRoutes } from './uploads.js';
import type { StoragePolicy } from './uploadStorage.js';

export interface AppServer {
  http: HttpServer;
  io: SocketIoServer;
}

export interface AppServerOptions {
  /** How long a dropped player keeps their spot (and shows as
   * "reconnecting") before being removed as if they'd left. Long enough to
   * ride out a reload or a network blip; short enough that a closed tab
   * doesn't leave a ghost standing in the room. */
  disconnectGraceMs?: number;
  /** Where uploaded maps/sounds are stored (default: server/uploads). */
  uploadsDir?: string;
  /** Upload storage cap and cleanup (default: uploadStorage.ts). */
  uploadPolicy?: StoragePolicy;
  /** Uploads per client IP per window (default: uploads.ts). */
  uploadRateLimit?: { limit: number; windowMs: number };
  /** A built client (client/dist) to serve from the same origin — how a
   * deployment runs: one container, one port. Unset in dev (Vite serves). */
  clientDist?: string;
  /** Allowed browser origin(s) for REST and Socket.IO (default: any). */
  corsOrigin?: string;
  /** Express's "trust proxy" setting, so behind a reverse proxy the upload
   * rate limit sees each player's real IP, not the proxy's. */
  trustProxy?: string;
}

const DEFAULT_DISCONNECT_GRACE_MS = 45_000;
/** Minimum spacing between one socket's emotes. */
const EMOTE_MIN_INTERVAL_MS = 400;

type PatchKey = keyof SessionPatch['patch'];
/** What a join, leave, reconnect or removal changes. */
const PRESENCE_KEYS: PatchKey[] = ['players', 'hostId', 'log'];
/** Pings are for pointing, not strobing: at most one per socket this often. */
const PING_MIN_INTERVAL_MS = 300;
/** Chat flood guard, per socket: at most this many lines per window. */
const CHAT_WINDOW_MS = 5000;
const CHAT_MAX_PER_WINDOW = 6;

/** Every acked event's rejection when the socket isn't joined to the
 * payload's session as the payload's player — see `actsAs` below. */
const NOT_JOINED_AS_PLAYER = 'Not joined to this session as that player.';

interface SocketIdentity {
  sessionId: string;
  playerId: string;
}

function playerKey(sessionId: string, playerId: string): string {
  return `${sessionId}\u0000${playerId}`;
}

/**
 * Builds (but does not start listening on) the Express + Socket.IO server.
 * Split out from src/index.ts so tests can spin up a real server on an
 * ephemeral port instead of mocking the transport.
 *
 * Identity model (docs/decisions.md, "identity binding"): a socket's player
 * identity is fixed by its own successful `session:join` and remembered
 * here, server-side. Every later event is checked against that binding —
 * the `playerId`/`sessionId` fields inside a payload are never trusted on
 * their own, since player ids are public (every client sees them in
 * GameState) and a forged payload could otherwise claim to be the host.
 */
export function createAppServer(options: AppServerOptions = {}): AppServer {
  const disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;

  const corsOrigin = options.corsOrigin ?? '*';
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) {
    app.set('trust proxy', options.trustProxy);
  }
  app.use(cors({ origin: corsOrigin }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const sessions = new SessionStore();
  const stopUploadSweeps = registerUploadRoutes(app, {
    root: options.uploadsDir,
    policy: options.uploadPolicy,
    inUse: () => sessions.referencedUploads(),
    rateLimit: options.uploadRateLimit,
  });

  if (options.clientDist) {
    serveClient(app, options.clientDist);
  }

  const http = createServer(app);
  http.on('close', stopUploadSweeps);
  const io = new SocketIoServer(http, {
    cors: { origin: corsOrigin },
  });

  /** socket.id -> the identity that socket joined as. */
  const identities = new Map<string, SocketIdentity>();
  /** playerKey -> the socket currently speaking for that player. */
  const activeSocketByPlayer = new Map<string, string>();
  /** playerKey -> pending "remove after the grace period" timer. */
  const removalTimers = new Map<string, NodeJS.Timeout>();

  /** Sends the room only the parts of the state an action changed
   * (`SessionPatch`) rather than the full snapshot with every drawing. */
  const broadcastPatch = (sessionId: string, state: GameState, keys: PatchKey[]) => {
    const patch: SessionPatch['patch'] = {};
    for (const key of keys) {
      (patch as Record<string, unknown>)[key] = state[key];
    }
    io.to(sessionId).emit(SocketEvent.SessionPatch, { sessionId, patch } satisfies SessionPatch);
  };

  const broadcastPresence = (sessionId: string) => {
    const state = sessions.get(sessionId);
    if (state) {
      broadcastPatch(sessionId, state, PRESENCE_KEYS);
    }
  };

  const cancelRemoval = (key: string) => {
    const timer = removalTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      removalTimers.delete(key);
    }
  };

  /** Stops `socket` speaking for whatever player it was bound to. With
   * `markAway`, the player also shows as disconnected and is scheduled for
   * removal after the grace period (a dropped connection) — without it, the
   * caller is handling the player's fate itself (an explicit leave). */
  const unbind = (socket: Socket, markAway: boolean) => {
    const identity = identities.get(socket.id);
    identities.delete(socket.id);
    if (!identity) {
      return;
    }
    socket.leave(identity.sessionId);

    const key = playerKey(identity.sessionId, identity.playerId);
    if (activeSocketByPlayer.get(key) !== socket.id) {
      return; // already superseded by a newer connection for the same player
    }
    activeSocketByPlayer.delete(key);
    if (!markAway) {
      return;
    }

    if (sessions.setConnected(identity.sessionId, identity.playerId, false)) {
      broadcastPresence(identity.sessionId);
    }
    cancelRemoval(key);
    const timer = setTimeout(() => {
      removalTimers.delete(key);
      const result = sessions.removeIfDisconnected(identity.sessionId, identity.playerId);
      if (result.removed) {
        broadcastPresence(identity.sessionId);
      }
    }, disconnectGraceMs);
    timer.unref();
    removalTimers.set(key, timer);
  };

  http.on('close', () => {
    removalTimers.forEach((timer) => clearTimeout(timer));
    removalTimers.clear();
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    /** Whether this socket joined `sessionId` as `playerId`. */
    const actsAs = (sessionId: string, playerId: string): boolean => {
      const identity = identities.get(socket.id);
      return identity?.sessionId === sessionId && identity.playerId === playerId;
    };
    /** Identity for events whose payload carries no playerId. */
    const playerIn = (sessionId: string): string | null => {
      const identity = identities.get(socket.id);
      return identity?.sessionId === sessionId ? identity.playerId : null;
    };

    socket.on(ConnectionEvent.Ping, (payload: unknown) => {
      socket.emit(ConnectionEvent.Pong, payload);
    });

    socket.on(
      SocketEvent.SessionJoin,
      (payload: unknown, ack?: (response: SessionJoinResponse) => void) => {
        const request = parseSessionJoinRequest(payload);
        if (!request) {
          ack?.({
            ok: false,
            error: 'sessionId, playerId, playerName, and playerToken are required.',
          });
          return;
        }
        if (request.resume && !sessions.get(request.sessionId)) {
          ack?.({ ok: false, error: SESSION_ENDED_ERROR });
          return;
        }
        if (!sessions.authorizeJoin(request.sessionId, request.playerId, request.playerToken)) {
          ack?.({ ok: false, error: 'That player identity belongs to someone else.' });
          return;
        }
        if (!sessions.canAdmit(request.sessionId, request.playerId)) {
          ack?.({
            ok: false,
            error: `That session is full (${MAX_PLAYERS_PER_SESSION} players max).`,
          });
          return;
        }

        // Switching sessions (or re-sending join on the same socket) —
        // release whatever this socket spoke for before.
        const previous = identities.get(socket.id);
        if (
          previous &&
          (previous.sessionId !== request.sessionId || previous.playerId !== request.playerId)
        ) {
          unbind(socket, true);
        }

        // A newer connection for the same player takes over from an older
        // one (the same tab on a fresh socket, or a duplicated tab).
        const key = playerKey(request.sessionId, request.playerId);
        const supersededId = activeSocketByPlayer.get(key);
        if (supersededId && supersededId !== socket.id) {
          identities.delete(supersededId);
          const superseded = io.sockets.sockets.get(supersededId);
          superseded?.leave(request.sessionId);
          superseded?.emit(SocketEvent.SessionReplaced);
        }
        cancelRemoval(key);

        const state = sessions.join(
          request.sessionId,
          request.playerId,
          request.playerName,
          request.playerToken,
          request.color,
        );
        identities.set(socket.id, { sessionId: request.sessionId, playerId: request.playerId });
        activeSocketByPlayer.set(key, socket.id);
        socket.join(request.sessionId);

        ack?.({ ok: true, state });
        broadcastPatch(request.sessionId, state, PRESENCE_KEYS);
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        unbind(socket, false);
        cancelRemoval(playerKey(request.sessionId, request.playerId));
        const state = sessions.leave(request.sessionId, request.playerId);
        ack?.({ ok: true });

        if (state) {
          broadcastPatch(request.sessionId, state, PRESENCE_KEYS);
        }
      },
    );

    // Read-only and deliberately open to any socket (no join needed) — the
    // join screen uses it to show who's in a session and grey out colors
    // that are already taken. Knowing a session's code is what grants this.
    socket.on(
      SocketEvent.SessionPeek,
      (payload: unknown, ack?: (response: SessionPeekResponse) => void) => {
        const request = parseSessionPeekRequest(payload);
        ack?.(
          request
            ? sessions.peek(request.sessionId)
            : { exists: false, playerCount: 0, hostName: null, takenColors: [] },
        );
      },
    );

    socket.on(
      SocketEvent.PlayerUpdate,
      (payload: unknown, ack?: (response: PlayerUpdateResponse) => void) => {
        const request = parsePlayerUpdateRequest(payload);
        if (!request) {
          ack?.({
            ok: false,
            error: `A name (1-${MAX_PLAYER_NAME_LENGTH} characters) and/or a valid color is required.`,
          });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.updateProfile(request.sessionId, request.playerId, {
          name: request.name,
          color: request.color,
        });
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['players', 'log']);
        }
      },
    );

    socket.on(
      SocketEvent.SessionTransferHost,
      (payload: unknown, ack?: (response: SessionTransferHostResponse) => void) => {
        const request = parseSessionTransferHostRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and targetPlayerId are required.' });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.transferHost(
          request.sessionId,
          request.playerId,
          request.targetPlayerId,
        );
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['hostId', 'log']);
        }
      },
    );

    // No ack, no full-state broadcast: this fires many times a second while
    // a player walks, so it's rebroadcast as the same lightweight delta to
    // everyone else in the session (docs/engineering/architecture.md,
    // "Performance") rather than round-tripped or folded into session:state.
    socket.on(SocketEvent.PlayerMove, (payload: unknown) => {
      const request = parsePlayerMoveRequest(payload);
      if (!request || !actsAs(request.sessionId, request.playerId)) {
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

    // Fire-and-forget like player:move: nothing is stored (an emote is a
    // moment, not state) and the sender is excluded (they can't see their own
    // avatar from first person). Rate-limited per socket so holding a key or
    // a scripted client can't flood everyone else.
    let lastEmoteAt = 0;
    socket.on(SocketEvent.PlayerEmote, (payload: unknown) => {
      const request = parsePlayerEmoteRequest(payload);
      if (!request || !actsAs(request.sessionId, request.playerId)) {
        return;
      }
      const now = Date.now();
      if (now - lastEmoteAt < EMOTE_MIN_INTERVAL_MS) {
        return;
      }
      lastEmoteAt = now;
      socket.to(request.sessionId).emit(SocketEvent.PlayerEmote, request);
    });

    // "Look here!" on the table: relayed to everyone else (the pinger shows
    // their own at once), never stored — like an emote, but on the map.
    let lastPingAt = 0;
    socket.on(SocketEvent.TablePing, (payload: unknown) => {
      const request = parseTablePingRequest(payload);
      if (!request || !actsAs(request.sessionId, request.playerId)) {
        return;
      }
      const now = Date.now();
      if (now - lastPingAt < PING_MIN_INTERVAL_MS) {
        return;
      }
      lastPingAt = now;
      socket.to(request.sessionId).emit(SocketEvent.TablePing, request);
    });

    // Chat and typed rolls: ack, then the new log entry alone to the whole
    // room (sender included — it's their confirmation too). Not a full-state
    // broadcast: chat is frequent and shouldn't resend the map each time.
    let recentChat: number[] = [];
    socket.on(
      SocketEvent.ChatSend,
      (payload: unknown, ack?: (response: ChatSendResponse) => void) => {
        const request = parseChatSendRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: `Messages are 1-${MAX_CHAT_LENGTH} characters.` });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }
        const now = Date.now();
        recentChat = recentChat.filter((at) => now - at < CHAT_WINDOW_MS);
        if (recentChat.length >= CHAT_MAX_PER_WINDOW) {
          ack?.({ ok: false, error: 'Easy there — too many messages at once.' });
          return;
        }
        recentChat.push(now);

        const command = rollCommand(request.text);
        let result;
        if (command === null) {
          result = sessions.chat(request.sessionId, request.playerId, request.text);
        } else {
          // A bare "/roll" rolls a d20 — the die people usually mean.
          const notation = parseDiceNotation(command || 'd20');
          if (!notation) {
            ack?.({
              ok: false,
              error: 'Roll like "/roll 2d6+3": dice (NdS) and numbers joined by + or -.',
            });
            return;
          }
          result = sessions.rollNotation(request.sessionId, request.playerId, notation);
        }
        if (!result.ok) {
          ack?.(result);
          return;
        }
        ack?.({ ok: true });
        io.to(request.sessionId).emit(SocketEvent.LogEntry, {
          sessionId: request.sessionId,
          entry: result.entry,
        } satisfies LogEntryBroadcast);
      },
    );

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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.updateScene(request.sessionId, request.playerId, request.sceneId, {
          name: request.name,
          backgroundImage: request.backgroundImage,
          gridCells: request.gridCells,
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
      if (!request || !actsAs(request.sessionId, request.playerId)) {
        return;
      }

      const started = sessions.startDrawing(
        request.sessionId,
        request.sceneId,
        request.drawingId,
        request.playerId,
        request.point,
        request.color,
        request.width,
      );
      if (started) {
        socket.to(request.sessionId).emit(SocketEvent.DrawingStart, request);
      }
    });

    socket.on(SocketEvent.DrawingUpdate, (payload: unknown) => {
      const request = parseDrawingUpdateRequest(payload);
      const actorId = request ? playerIn(request.sessionId) : null;
      if (!request || !actorId) {
        return;
      }

      const updated = sessions.appendDrawingPoint(
        request.sessionId,
        request.drawingId,
        request.point,
        actorId,
      );
      if (updated) {
        socket.to(request.sessionId).emit(SocketEvent.DrawingUpdate, request);
      }
    });

    socket.on(SocketEvent.DrawingEnd, (payload: unknown) => {
      const request = parseDrawingEndRequest(payload);
      if (!request || !playerIn(request.sessionId)) {
        return;
      }

      socket.to(request.sessionId).emit(SocketEvent.DrawingEnd, request);
    });

    socket.on(SocketEvent.DrawingDelete, (payload: unknown) => {
      const request = parseDrawingDeleteRequest(payload);
      if (!request || !playerIn(request.sessionId)) {
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.spawnDice(
          request.sessionId,
          request.playerId,
          request.diceId,
          request.position,
          request.kind,
        );
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['dice', 'log']);
        }
      },
    );

    socket.on(
      SocketEvent.DiceRoll,
      (payload: unknown, ack?: (response: DiceRollResponse) => void) => {
        const request = parseDiceRollRequest(payload);
        if (!request) {
          ack?.({
            ok: false,
            error: `sessionId, playerId, and 1-${MAX_DICE_PER_ROLL} diceIds are required.`,
          });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.rollDice(request.sessionId, request.diceIds, request.playerId);
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['dice', 'log']);
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.removeDice(request.sessionId, request.diceId);
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['dice', 'log']);
        }
      },
    );

    // Not host-gated (relaxed from host-only in the wall-soundboard
    // follow-up — see docs/decisions.md and shared/src/sound.ts's header
    // comment). No persisted state to broadcast back (playing a sound
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }
        if (!sessions.hasSound(request.sessionId, request.soundId)) {
          ack?.({ ok: false, error: 'Sound not found.' });
          return;
        }

        ack?.({ ok: true });
        io.to(request.sessionId).emit(SocketEvent.SoundPlay, request);
      },
    );

    // Not host-gated — any player can contribute a sound to the shared
    // soundboard (Milestone 8). Infrequent, full-state ack + broadcast —
    // same pattern as scene:*/dice:*. The file itself was already uploaded
    // over REST (see uploads.ts); this just registers the resulting URL
    // into GameState.soundboard, and — when `slotIndex` is present (pressing
    // an empty wall-board button) — assigns it to that slot in the same
    // mutation.
    socket.on(
      SocketEvent.SoundUpload,
      (payload: unknown, ack?: (response: SoundUploadResponse) => void) => {
        const request = parseSoundUploadRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, soundId, name, and url are required.' });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.addSound(
          request.sessionId,
          request.soundId,
          request.name,
          request.url,
          request.slotIndex,
          request.playerId,
        );
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['soundboard', 'soundboardSlots']);
        }
      },
    );

    // Open to any player, like the wall board itself — reassign or clear a
    // button. Ack + full broadcast.
    socket.on(
      SocketEvent.SoundboardAssign,
      (payload: unknown, ack?: (response: SoundboardAssignResponse) => void) => {
        const request = parseSoundboardAssignRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, slotIndex, and soundId are required.' });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.assignSoundboardSlot(
          request.sessionId,
          request.slotIndex,
          request.soundId,
        );
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['soundboard', 'soundboardSlots']);
        }
      },
    );

    // Whoever added a sound (or the host) can remove it; see
    // SessionStore.removeSound.
    socket.on(
      SocketEvent.SoundRemove,
      (payload: unknown, ack?: (response: SoundRemoveResponse) => void) => {
        const request = parseSoundRemoveRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and soundId are required.' });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.removeSound(request.sessionId, request.playerId, request.soundId);
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['soundboard', 'soundboardSlots']);
        }
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
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
          broadcastPatch(request.sessionId, result.state, ['players']);
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
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
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
          broadcastPatch(request.sessionId, result.state, ['players']);
        }
      },
    );

    // One generic event for every room interactable (Milestone 8),
    // dispatched on objectId — see SessionStore.toggleLight/toggleSeated
    // and shared/src/interactables.ts. Not host-gated (neither mutation has
    // a per-player authority question to protect). Infrequent, full-state
    // ack + broadcast — same pattern as scene:*/dice:*.
    socket.on(
      SocketEvent.ObjectInteract,
      (payload: unknown, ack?: (response: ObjectInteractResponse) => void) => {
        const request = parseObjectInteractRequest(payload);
        if (!request) {
          ack?.({ ok: false, error: 'sessionId, playerId, and objectId are required.' });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        let result: ObjectInteractResponse;
        switch (request.objectId) {
          case 'light':
            result = sessions.toggleLight(request.sessionId);
            break;
          case 'table':
            result =
              request.seated === undefined
                ? sessions.toggleSeated(request.sessionId, request.playerId)
                : sessions.setSeated(
                    request.sessionId,
                    request.playerId,
                    request.seated,
                    request.seatIndex,
                  );
            break;
          default:
            result = { ok: false, error: 'Unknown interactable.' };
        }

        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['lightOn', 'players']);
        }
      },
    );

    // Open to every player. Ack + full-state broadcast (infrequent).
    socket.on(
      SocketEvent.WhiteboardWrite,
      (payload: unknown, ack?: (response: WhiteboardWriteResponse) => void) => {
        const request = parseWhiteboardWriteRequest(payload);
        if (!request) {
          ack?.({
            ok: false,
            error: `The whiteboard takes ${WHITEBOARD_LINE_COUNT} lines of up to ${WHITEBOARD_MAX_LINE_LENGTH} characters.`,
          });
          return;
        }
        if (!actsAs(request.sessionId, request.playerId)) {
          ack?.({ ok: false, error: NOT_JOINED_AS_PLAYER });
          return;
        }

        const result = sessions.writeWhiteboard(request.sessionId, request.playerId, request.lines);
        ack?.(result);
        if (result.ok) {
          broadcastPatch(request.sessionId, result.state, ['whiteboard']);
        }
      },
    );

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
      // A dropped connection doesn't remove the player immediately — they
      // show as "reconnecting" and keep their spot for the grace period, so
      // a reload or network blip rejoins seamlessly (docs/decisions.md).
      unbind(socket, true);
    });
  });

  return { http, io };
}

/**
 * The built client, served by this same server in production. Vite's
 * content-hashed `assets/` never change under a name, so browsers keep them
 * for a year; everything else (index.html, the room model, characters) is
 * revalidated on each load, a cheap 304 when nothing changed — a redeploy
 * shows up on the next reload.
 */
function serveClient(app: express.Express, clientDist: string): void {
  const root = path.resolve(clientDist);
  app.use(
    express.static(root, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        const inAssets = path.relative(root, filePath).startsWith(`assets${path.sep}`);
        res.setHeader(
          'Cache-Control',
          inAssets ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  // Any other page path (the app has one page) gets the app itself.
  app.get(/^\/(?!uploads\/|socket\.io\/|health$).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(root, 'index.html'));
  });
}
