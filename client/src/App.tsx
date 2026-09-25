import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import type { Socket } from 'socket.io-client';
import {
  SESSION_ENDED_ERROR,
  REMOVED_FROM_TABLE_ERROR,
  mayUse,
  type HostAction,
  type SessionRemoved,
  SocketEvent,
  type ClipAction,
  type DiceMoveRequest,
  type DiceMoved,
  type MiniMoveRequest,
  type MiniMoved,
  type Point2D,
  type Vector3,
  type ClipControlRequest,
  type ClipControlResponse,
  type ClipLockRequest,
  type ClipLockResponse,
  type SessionHostKey,
  parseYouTubeUrl,
  type GameState,
  type PlayerColorId,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type SessionPeekResponse,
  type SoundPlayRequest,
  type DieKind,
  appendLogEntry,
  type ChatSendResponse,
  type LogEntryBroadcast,
  type SessionPatch,
} from '@custom-tabletop/shared';
import { Toasts } from './Toasts.js';
import type { ClipView } from './YouTubeClip.js';
import { ChatPanel } from './ChatPanel.js';
import { useToasts } from './useToasts.js';
import { createSocket } from './socket.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';
import { getOrCreatePlayerId, getOrCreatePlayerToken } from './playerIdentity.js';
import { loadHostKey, saveHostKey } from './hostKeys.js';
import {
  clearLastJoin,
  loadLastJoin,
  loadRememberedColor,
  loadRememberedName,
  rememberColor,
  rememberName,
  saveLastJoin,
  type JoinIntent,
} from './joinMemory.js';
import { BrandMark, JoinForm } from './JoinForm.js';
import { RoomLoading } from './RoomLoading.js';
import { preloadRoom } from './roomAssets.js';
import { PLACEHOLDER_ROOM_LAYOUT } from './three/RoomLayout.js';
import { randomDiceSpawnPosition } from './diceSpawn.js';
import { playSound, setMasterVolume } from './sounds.js';
import { useSettings } from './useSettings.js';

// The game view — three.js, the room, the session menu — is its own chunk:
// the join screen doesn't need it, so it loads (and the room model starts
// downloading) in the background while the player picks a name.
const loadRoomView = () => import('./three/RoomView.js');
const loadSessionView = () => import('./SessionView.js');
const RoomView = lazy(() => loadRoomView().then((module) => ({ default: module.RoomView })));
const SessionView = lazy(() =>
  loadSessionView().then((module) => ({ default: module.SessionView })),
);

type AckResponse = { ok: true } | { ok: false; error: string };

const PEEK_TIMEOUT_MS = 3000;
const NO_SESSION: SessionPeekResponse = {
  exists: false,
  playerCount: 0,
  hostName: null,
  takenColors: [],
};

/** An invite link is the app URL with `?join=CODE` (copied from the session
 * menu) — it opens the join screen with the code pre-filled. */
function readInviteCode(): string | null {
  consumeHostLink();
  const code = new URLSearchParams(window.location.search).get('join');
  return code ? code.trim().toUpperCase() : null;
}

/** `minis` with one player's mini moved, placed, or (null) taken off. */
function withMini(
  minis: Record<string, Point2D>,
  playerId: string,
  point: Point2D | null,
): Record<string, Point2D> {
  const next = { ...minis };
  if (point) next[playerId] = point;
  else delete next[playerId];
  return next;
}

function hasHostKey(sessionId: string): boolean {
  return loadHostKey(window.localStorage, sessionId) !== null;
}

/** A host link (`?join=CODE&host=KEY`, see hostKeys.ts): keep the key for
 * that table, and take it straight back out of the address bar so it
 * doesn't linger in the history or a screenshot. */
function consumeHostLink(): void {
  const url = new URL(window.location.href);
  const key = url.searchParams.get('host');
  if (!key) {
    return;
  }
  const code = url.searchParams.get('join');
  if (code) {
    saveHostKey(window.localStorage, code.trim().toUpperCase(), key.trim());
  }
  url.searchParams.delete('host');
  window.history.replaceState(null, '', url);
}

function clearInviteFromUrl(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has('join')) {
    url.searchParams.delete('join');
    window.history.replaceState(null, '', url);
  }
}

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Set once a join succeeds (and persisted per tab, see joinMemory.ts);
  // re-used to auto-rejoin after a reconnect or a page reload, not just on
  // the user's first submit.
  const lastJoinRef = useRef<JoinIntent | null>(loadLastJoin(window.sessionStorage));
  // True while an automatic rejoin is in flight, so a reload shows
  // "rejoining…" instead of flashing the join form.
  const [rejoining, setRejoining] = useState(() => lastJoinRef.current !== null);
  // Mirrors `gameState` for the SoundPlay listener below, which is registered
  // once inside the mount effect and would otherwise close over a stale
  // (possibly null, possibly outdated) gameState when a sound:play broadcast
  // arrives later — including for sounds uploaded after that closure formed.
  const gameStateRef = useRef<GameState | null>(null);
  const [playerId] = useState(() => getOrCreatePlayerId(window.sessionStorage));
  const [playerToken] = useState(() => getOrCreatePlayerToken(window.sessionStorage));
  const [inviteCode] = useState(readInviteCode);
  // The current table's host key, while this player is its host (and has
  // been sent it) — for the host link in the session menu.
  const [hostKey, setHostKey] = useState<string | null>(null);
  const { settings } = useSettings();
  const { toasts, toast, dismiss } = useToasts();
  // serverClock - localClock (ms), from the join ack: the shared clip's
  // anchor is on the server's clock (clip.ts).
  const [serverOffset, setServerOffset] = useState(0);
  // A clip this browser couldn't play (e.g. blocked here): hidden locally,
  // without stopping it for everyone else.
  const [failedClipId, setFailedClipId] = useState<string | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Keeps sounds.ts's module-level volume in sync with the player's own
  // setting — sounds.ts isn't a React component, so it can't read
  // SettingsContext itself.
  useEffect(() => {
    setMasterVolume(settings.masterVolume);
  }, [settings.masterVolume]);

  const forgetSession = useCallback((error: string | null) => {
    lastJoinRef.current = null;
    clearLastJoin(window.sessionStorage);
    setGameState(null);
    setRejoining(false);
    setJoinError(error);
  }, []);

  /** `resume`: an automatic rejoin (reload/reconnect) — must not recreate a
   * session that has since ended (see SessionJoinRequest.resume). */
  const joinSession = useCallback(
    (
      socket: Socket,
      playerName: string,
      sessionId: string,
      resume: boolean,
      color?: PlayerColorId,
    ) => {
      setJoinError(null);
      // A saved table everyone has left reopens only for its host key.
      const knownHostKey = loadHostKey(window.localStorage, sessionId) ?? undefined;
      socket.emit(
        SocketEvent.SessionJoin,
        { sessionId, playerId, playerName, playerToken, resume, color, hostKey: knownHostKey },
        (response: SessionJoinResponse) => {
          setRejoining(false);
          if (response.ok) {
            if (response.hostKey) {
              saveHostKey(window.localStorage, sessionId, response.hostKey);
            }
            setHostKey(response.hostKey ?? null);
            setServerOffset(response.serverNow - Date.now());
            const intent = { playerName, sessionId };
            lastJoinRef.current = intent;
            saveLastJoin(window.sessionStorage, intent);
            clearInviteFromUrl();
            setGameState(response.state);
          } else if (resume) {
            forgetSession(
              response.error === SESSION_ENDED_ERROR
                ? `Session ${sessionId} has ended — host a new one or join another.`
                : response.error,
            );
          } else {
            setJoinError(response.error);
          }
        },
      );
    },
    [playerId, playerToken, forgetSession],
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      const lastJoin = lastJoinRef.current;
      if (lastJoin) {
        joinSession(socket, lastJoin.playerName, lastJoin.sessionId, true);
      }
    });

    socket.on(SocketEvent.SessionState, (state: GameState) => {
      setGameState((current) => (current?.sessionId === state.sessionId ? state : current));
    });

    // Most actions send just what changed (SessionPatch) — merged over our
    // copy; a full snapshot (session:state) replaces it.
    socket.on(SocketEvent.SessionPatch, (message: SessionPatch) => {
      setGameState((current) =>
        current?.sessionId === message.sessionId ? { ...current, ...message.patch } : current,
      );
    });

    // Chat lines and typed rolls arrive one entry at a time (log.ts).
    socket.on(SocketEvent.LogEntry, (message: LogEntryBroadcast) => {
      setGameState((current) =>
        current?.sessionId === message.sessionId
          ? { ...current, log: appendLogEntry(current.log, message.entry) }
          : current,
      );
    });

    // Someone else moved a mini or dragged a die (minis.ts).
    socket.on(SocketEvent.MiniMoved, (message: MiniMoved) => {
      setGameState((current) =>
        current?.sessionId === message.sessionId
          ? { ...current, minis: withMini(current.minis, message.targetPlayerId, message.point) }
          : current,
      );
    });
    socket.on(SocketEvent.DiceMoved, (message: DiceMoved) => {
      setGameState((current) =>
        current?.sessionId === message.sessionId
          ? {
              ...current,
              dice: current.dice.map((die) =>
                die.id === message.diceId ? { ...die, position: message.position } : die,
              ),
            }
          : current,
      );
    });

    // Became the host (a handover, or the host left): keep the table's key.
    socket.on(SocketEvent.SessionHostKey, (message: SessionHostKey) => {
      saveHostKey(window.localStorage, message.sessionId, message.hostKey);
      if (gameStateRef.current?.sessionId === message.sessionId) {
        setHostKey(message.hostKey);
      }
    });

    // This tab's player identity was claimed by a newer connection (a
    // duplicated tab sharing the same sessionStorage, typically) — this tab
    // no longer speaks for that player, so it drops back to the join screen
    // instead of silently sending events the server now ignores.
    socket.on(SocketEvent.SessionReplaced, () => {
      forgetSession('You joined this session from another tab, so this one was disconnected.');
    });

    // The host removed this player from the table (host.ts).
    socket.on(SocketEvent.SessionRemoved, (message: SessionRemoved) => {
      if (gameStateRef.current?.sessionId === message.sessionId) {
        forgetSession(REMOVED_FROM_TABLE_ERROR);
      }
    });

    // Every client — including the host who triggered it — plays the sound
    // only once this broadcast arrives, rather than optimistically locally;
    // see docs/decisions.md (Milestone 7) for why sound:play doesn't follow
    // drawing:* / player:move's local-prediction pattern. Looks up the entry
    // from live state (via the ref) rather than trusting the request payload
    // alone, since an uploaded sound's url isn't known to this listener
    // otherwise.
    socket.on(SocketEvent.SoundPlay, (request: SoundPlayRequest) => {
      const state = gameStateRef.current;
      const entry = state?.soundboard.find((sound) => sound.id === request.soundId);
      if (!entry) {
        return;
      }
      // YouTube links arrive as the shared clip in state instead (clip.ts).
      if (parseYouTubeUrl(entry.url)) {
        return;
      }
      playSound(entry).catch(() => toast(`Couldn’t play “${entry.name}”.`, 'error'));
    });

    socket.on('disconnect', () => setStatus('disconnected'));

    return () => {
      socket.disconnect();
    };
  }, [joinSession, forgetSession, toast]);

  // Keep the join screen's remembered name/color in step with whatever this
  // player currently is — including mid-session profile changes.
  const self = gameState?.players.find((player) => player.id === playerId);
  useEffect(() => {
    if (self) {
      rememberName(window.localStorage, self.name);
      rememberColor(window.localStorage, self.color);
    }
  }, [self?.name, self?.color]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Emits a session-scoped action (sessionId + playerId filled in); a
   * rejection surfaces as a toast so the player learns *why* nothing
   * happened — the shared shape of every ack'd request below. */
  function sendAction(event: string, fields: Record<string, unknown>, failure: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }
    socket.emit(
      event,
      { sessionId: gameState.sessionId, playerId, ...fields },
      (response: AckResponse) => {
        if (!response.ok) {
          console.error(`${failure}:`, response.error);
          toast(response.error, 'error');
        }
      },
    );
  }

  const handlePeek = useCallback(
    (sessionId: string) =>
      new Promise<SessionPeekResponse>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve(NO_SESSION);
          return;
        }
        socket
          .timeout(PEEK_TIMEOUT_MS)
          .emit(
            SocketEvent.SessionPeek,
            { sessionId },
            (err: Error | null, response: SessionPeekResponse) =>
              resolve(err ? NO_SESSION : response),
          );
      }),
    [],
  );

  function handleJoin(playerName: string, sessionId: string, color: PlayerColorId) {
    if (socketRef.current) {
      joinSession(socketRef.current, playerName, sessionId, false, color);
    }
  }

  const handleUpdateProfile = (patch: { name?: string; color?: PlayerColorId }) =>
    sendAction(SocketEvent.PlayerUpdate, patch, 'Failed to update your profile');

  function handleLeave() {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.SessionLeave,
      { sessionId: gameState.sessionId, playerId },
      (response: SessionLeaveResponse) => {
        if (!response.ok) {
          console.error('Failed to leave session:', response.error);
        }
        forgetSession(null);
      },
    );
  }

  const handleSetMapBackground = (backgroundImage: string) =>
    sendAction(
      SocketEvent.SceneUpdate,
      { sceneId: gameState?.activeSceneId, backgroundImage },
      'Failed to update the map',
    );

  const handleSetMapGrid = (gridCells: number) =>
    sendAction(
      SocketEvent.SceneUpdate,
      { sceneId: gameState?.activeSceneId, gridCells },
      'Failed to change the grid',
    );

  const handleSpawnDie = (kind: DieKind, hidden = false) =>
    sendAction(
      SocketEvent.DiceSpawn,
      {
        diceId: crypto.randomUUID(),
        kind,
        ...(hidden ? { hidden: true } : {}),
        position: randomDiceSpawnPosition(
          PLACEHOLDER_ROOM_LAYOUT.table,
          gameState?.dice.map((die) => die.position),
        ),
      },
      'Failed to add a die',
    );

  const handleRollDice = (diceIds: string[]) =>
    sendAction(SocketEvent.DiceRoll, { diceIds }, 'Failed to roll');

  const handleRemoveDie = (diceId: string) =>
    sendAction(SocketEvent.DiceRemove, { diceId }, 'Failed to remove the die');

  const handlePlaySound = (soundId: string) =>
    sendAction(SocketEvent.SoundPlay, { soundId }, 'Failed to play sound');

  const handleUploadSound = (name: string, url: string, slotIndex?: number) =>
    sendAction(
      SocketEvent.SoundUpload,
      { soundId: crypto.randomUUID(), name, url, slotIndex },
      'Failed to upload sound',
    );

  const handleAssignSlot = (slotIndex: number, soundId: string | null) =>
    sendAction(
      SocketEvent.SoundboardAssign,
      { slotIndex, soundId },
      'Failed to change the wall button',
    );

  const handleRemoveSound = (soundId: string) =>
    sendAction(SocketEvent.SoundRemove, { soundId }, 'Failed to remove the sound');

  const handleWriteWhiteboard = (lines: (string | null)[]) =>
    sendAction(SocketEvent.WhiteboardWrite, { lines }, 'Failed to write on the whiteboard');

  const handleObjectInteract = (objectId: string) =>
    sendAction(SocketEvent.ObjectInteract, { objectId }, 'Failed to interact');

  const handleMutePlayer = (targetPlayerId: string) =>
    sendAction(SocketEvent.PlayerMute, { targetPlayerId }, 'Failed to mute player');

  const handleUnmutePlayer = (targetPlayerId: string) =>
    sendAction(SocketEvent.PlayerUnmute, { targetPlayerId }, 'Failed to unmute player');

  const handleTransferHost = (targetPlayerId: string) =>
    sendAction(
      SocketEvent.SessionTransferHost,
      { targetPlayerId },
      'Failed to hand over the host role',
    );

  // Minis and dragged dice: shown at once here, then sent (minis.ts).
  const handleMoveMini = useCallback(
    (targetPlayerId: string, point: Point2D | null) => {
      const socket = socketRef.current;
      const state = gameStateRef.current;
      if (!socket || !state) return;
      setGameState((current) =>
        current ? { ...current, minis: withMini(current.minis, targetPlayerId, point) } : current,
      );
      socket.emit(SocketEvent.MiniMove, {
        sessionId: state.sessionId,
        playerId,
        targetPlayerId,
        point,
      } satisfies MiniMoveRequest);
    },
    [playerId],
  );

  const handleMoveDie = useCallback(
    (diceId: string, position: Vector3) => {
      const socket = socketRef.current;
      const state = gameStateRef.current;
      if (!socket || !state) return;
      setGameState((current) =>
        current
          ? {
              ...current,
              dice: current.dice.map((die) => (die.id === diceId ? { ...die, position } : die)),
            }
          : current,
      );
      socket.emit(SocketEvent.DiceMove, {
        sessionId: state.sessionId,
        playerId,
        diceId,
        position,
      } satisfies DiceMoveRequest);
    },
    [playerId],
  );

  // The shared YouTube clip: anyone's pause/play/seek/stop goes to the
  // server and comes back to everyone as state (clip.ts).
  const handleClipControl = (action: ClipAction, position: number) => {
    const socket = socketRef.current;
    const state = gameStateRef.current;
    if (!socket || !state?.clip) return;
    socket.emit(
      SocketEvent.ClipControl,
      {
        sessionId: state.sessionId,
        playerId,
        clipId: state.clip.id,
        action,
        position,
      } satisfies ClipControlRequest,
      (response: ClipControlResponse) => {
        if (!response.ok && action !== 'ended') toast(response.error, 'error');
      },
    );
  };

  const handleHostAction = (action: HostAction) =>
    sendAction(SocketEvent.HostAction, action, 'Host action failed');

  const handleClipLock = (locked: boolean) => {
    const socket = socketRef.current;
    const state = gameStateRef.current;
    if (!socket || !state) return;
    socket.emit(
      SocketEvent.ClipLock,
      { sessionId: state.sessionId, playerId, locked } satisfies ClipLockRequest,
      (response: ClipLockResponse) => {
        if (!response.ok) toast(response.error, 'error');
      },
    );
  };

  const sharedClip = gameState?.clip ?? null;
  const clipView: ClipView | null =
    gameState && sharedClip && sharedClip.id !== failedClipId
      ? {
          clip: sharedClip,
          serverOffset,
          volume: settings.masterVolume,
          canControl: !gameState.clipLocked || gameState.hostId === playerId,
          isHost: gameState.hostId === playerId,
          locked: gameState.clipLocked,
          onControl: handleClipControl,
          onLock: handleClipLock,
          onError: (message) => {
            toast(message, 'error');
            setFailedClipId(sharedClip.id);
          },
        }
      : null;

  const handleSendChat = (text: string) =>
    new Promise<boolean>((resolve) => {
      const socket = socketRef.current;
      if (!socket || !gameState) {
        resolve(false);
        return;
      }
      socket.emit(
        SocketEvent.ChatSend,
        { sessionId: gameState.sessionId, playerId, text },
        (response: ChatSendResponse) => {
          if (!response.ok) {
            toast(response.error, 'error');
          }
          resolve(response.ok);
        },
      );
    });

  // Warm up the game view while the player is still on the join screen:
  // its code, and the room model's bytes (roomAssets.ts).
  const onJoinScreen = !gameState;
  useEffect(() => {
    if (!onJoinScreen) return;
    const timer = window.setTimeout(() => {
      void loadRoomView();
      void loadSessionView();
      void preloadRoom().catch(() => {});
    }, 600);
    return () => window.clearTimeout(timer);
  }, [onJoinScreen]);

  const activeScene = gameState?.scenes.find((scene) => scene.id === gameState.activeSceneId);

  if (gameState && socketRef.current && activeScene) {
    return (
      <main className="game-shell">
        <Suspense fallback={<RoomLoading />}>
          <RoomView
            socket={socketRef.current}
            sessionId={gameState.sessionId}
            playerId={playerId}
            players={gameState.players}
            activeScene={activeScene}
            dice={gameState.dice}
            minis={gameState.minis}
            hostId={gameState.hostId}
            onMoveMini={handleMoveMini}
            onMoveDie={handleMoveDie}
            lightOn={gameState.lightOn}
            soundboard={gameState.soundboard}
            soundboardSlots={gameState.soundboardSlots}
            interactKey={settings.interactKey}
            onPlaySound={handlePlaySound}
            onObjectInteract={handleObjectInteract}
            onUploadSound={handleUploadSound}
            onAssignSlot={handleAssignSlot}
            canDraw={mayUse(gameState, playerId, 'draw')}
            canUseSounds={mayUse(gameState, playerId, 'sounds')}
            onNotify={toast}
            whiteboard={gameState.whiteboard}
            onWriteWhiteboard={handleWriteWhiteboard}
            onRollDice={handleRollDice}
            log={gameState.log}
            fireSound={settings.fireSound}
            clipView={clipView}
          />
          <SessionView
            state={gameState}
            playerId={playerId}
            onLeave={handleLeave}
            onSetMapBackground={handleSetMapBackground}
            onSetMapGrid={handleSetMapGrid}
            onSpawnDie={handleSpawnDie}
            onRollDice={handleRollDice}
            onRemoveDie={handleRemoveDie}
            onPlaySound={handlePlaySound}
            onUploadSound={handleUploadSound}
            onMutePlayer={handleMutePlayer}
            onUnmutePlayer={handleUnmutePlayer}
            onTransferHost={handleTransferHost}
            onUpdateProfile={handleUpdateProfile}
            onAssignSlot={handleAssignSlot}
            onRemoveSound={handleRemoveSound}
            onNotify={toast}
            hostKey={gameState.hostId === playerId ? hostKey : null}
            onMoveMini={handleMoveMini}
            onHostAction={handleHostAction}
            onLockClip={handleClipLock}
          />
        </Suspense>
        <ChatPanel log={gameState.log} players={gameState.players} onSend={handleSendChat} />
        {status !== 'connected' && (
          <div className="connection-banner" role="status">
            Connection lost — reconnecting…
          </div>
        )}
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </main>
    );
  }

  return (
    <main className="pre-join">
      {rejoining ? (
        <div className="join-card rejoin-card" role="status">
          <BrandMark />
          <p className="rejoin-title">
            {lastJoinRef.current ? (
              <>
                Rejoining session <strong>{lastJoinRef.current.sessionId}</strong>…
              </>
            ) : (
              'Rejoining…'
            )}
          </p>
          <p className="rejoin-detail">{connectionStatusLabel(status)}</p>
          <button type="button" className="secondary-button" onClick={() => forgetSession(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <JoinForm
          connection={status}
          error={joinError}
          initialName={loadRememberedName(window.localStorage)}
          initialColor={loadRememberedColor(window.localStorage)}
          inviteCode={inviteCode}
          onPeek={handlePeek}
          onJoin={handleJoin}
          hasHostKey={hasHostKey}
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
