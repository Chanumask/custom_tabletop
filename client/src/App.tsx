import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  SESSION_ENDED_ERROR,
  SocketEvent,
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
} from '@custom-tabletop/shared';
import { Toasts } from './Toasts.js';
import type { ActiveClip } from './YouTubeClip.js';
import { ChatPanel } from './ChatPanel.js';
import { useToasts } from './useToasts.js';
import { createSocket } from './socket.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';
import { getOrCreatePlayerId, getOrCreatePlayerToken } from './playerIdentity.js';
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
import { SessionView } from './SessionView.js';
import { RoomView } from './three/RoomView.js';
import { PLACEHOLDER_ROOM_LAYOUT } from './three/RoomLayout.js';
import { randomDiceSpawnPosition } from './diceSpawn.js';
import { playSound, setMasterVolume } from './sounds.js';
import { useSettings } from './useSettings.js';

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
  const code = new URLSearchParams(window.location.search).get('join');
  return code ? code.trim().toUpperCase() : null;
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
  const { settings } = useSettings();
  const { toasts, toast, dismiss } = useToasts();
  // The soundboard's visible YouTube player (YouTubeClip.tsx), if a clip is
  // currently playing.
  const [clip, setClip] = useState<ActiveClip | null>(null);
  const clipCounter = useRef(0);

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
      socket.emit(
        SocketEvent.SessionJoin,
        { sessionId, playerId, playerName, playerToken, resume, color },
        (response: SessionJoinResponse) => {
          setRejoining(false);
          if (response.ok) {
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

    // Chat lines and typed rolls arrive one entry at a time (log.ts).
    socket.on(SocketEvent.LogEntry, (message: LogEntryBroadcast) => {
      setGameState((current) =>
        current?.sessionId === message.sessionId
          ? { ...current, log: appendLogEntry(current.log, message.entry) }
          : current,
      );
    });

    // This tab's player identity was claimed by a newer connection (a
    // duplicated tab sharing the same sessionStorage, typically) — this tab
    // no longer speaks for that player, so it drops back to the join screen
    // instead of silently sending events the server now ignores.
    socket.on(SocketEvent.SessionReplaced, () => {
      forgetSession('You joined this session from another tab, so this one was disconnected.');
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
      const youtube = parseYouTubeUrl(entry.url);
      if (youtube) {
        const playedBy =
          state?.players.find((player) => player.id === request.playerId)?.name ?? 'someone';
        setClip({ key: ++clipCounter.current, ...youtube, title: entry.name, playedBy });
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

  const handleSpawnDie = (kind: DieKind) =>
    sendAction(
      SocketEvent.DiceSpawn,
      {
        diceId: crypto.randomUUID(),
        kind,
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

  const activeScene = gameState?.scenes.find((scene) => scene.id === gameState.activeSceneId);

  if (gameState && socketRef.current && activeScene) {
    return (
      <main className="game-shell">
        <RoomView
          socket={socketRef.current}
          sessionId={gameState.sessionId}
          playerId={playerId}
          players={gameState.players}
          activeScene={activeScene}
          dice={gameState.dice}
          lightOn={gameState.lightOn}
          soundboard={gameState.soundboard}
          soundboardSlots={gameState.soundboardSlots}
          interactKey={settings.interactKey}
          onPlaySound={handlePlaySound}
          onObjectInteract={handleObjectInteract}
          onUploadSound={handleUploadSound}
          onAssignSlot={handleAssignSlot}
          onNotify={toast}
          whiteboard={gameState.whiteboard}
          onWriteWhiteboard={handleWriteWhiteboard}
          onRollDice={handleRollDice}
          log={gameState.log}
          fireSound={settings.fireSound}
          clip={clip}
          clipVolume={settings.masterVolume}
          onClipClose={() => setClip(null)}
          onClipError={(message) => toast(message, 'error')}
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
        />
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
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
