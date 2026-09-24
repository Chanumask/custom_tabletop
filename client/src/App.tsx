import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  SESSION_ENDED_ERROR,
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type SoundPlayRequest,
} from '@custom-tabletop/shared';
import { createSocket } from './socket.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';
import { getOrCreatePlayerId, getOrCreatePlayerToken } from './playerIdentity.js';
import {
  clearLastJoin,
  loadLastJoin,
  loadRememberedName,
  rememberName,
  saveLastJoin,
  type JoinIntent,
} from './joinMemory.js';
import { JoinForm } from './JoinForm.js';
import { SessionView } from './SessionView.js';
import { RoomView } from './three/RoomView.js';
import { DIE_SIZE } from './three/DiceManager.js';
import { PLACEHOLDER_ROOM_LAYOUT } from './three/RoomLayout.js';
import { randomDiceSpawnPosition } from './diceSpawn.js';
import { playSound, setMasterVolume } from './sounds.js';
import { useSettings } from './useSettings.js';

type AckResponse = { ok: true } | { ok: false; error: string };

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
  const { settings } = useSettings();

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
    (socket: Socket, playerName: string, sessionId: string, resume: boolean) => {
      setJoinError(null);
      socket.emit(
        SocketEvent.SessionJoin,
        { sessionId, playerId, playerName, playerToken, resume },
        (response: SessionJoinResponse) => {
          setRejoining(false);
          if (response.ok) {
            const intent = { playerName, sessionId };
            lastJoinRef.current = intent;
            saveLastJoin(window.sessionStorage, intent);
            rememberName(window.localStorage, playerName);
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
      const entry = gameStateRef.current?.soundboard.find((sound) => sound.id === request.soundId);
      if (entry) {
        playSound(entry);
      }
    });

    socket.on('disconnect', () => setStatus('disconnected'));

    return () => {
      socket.disconnect();
    };
  }, [joinSession, forgetSession]);

  /** Emits a session-scoped action (sessionId + playerId filled in) and logs
   * a rejection — the shared shape of every ack'd request below. */
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
        }
      },
    );
  }

  function handleJoin(playerName: string, sessionId: string) {
    if (socketRef.current) {
      joinSession(socketRef.current, playerName, sessionId, false);
    }
  }

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

  const handleSpawnDie = () =>
    sendAction(
      SocketEvent.DiceSpawn,
      {
        diceId: crypto.randomUUID(),
        position: randomDiceSpawnPosition(PLACEHOLDER_ROOM_LAYOUT, DIE_SIZE),
      },
      'Failed to spawn a die',
    );

  const handleRollDie = (diceId: string) =>
    sendAction(SocketEvent.DiceRoll, { diceId }, 'Failed to roll the die');

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
        />
        <SessionView
          state={gameState}
          playerId={playerId}
          onLeave={handleLeave}
          onSetMapBackground={handleSetMapBackground}
          onSpawnDie={handleSpawnDie}
          onRollDie={handleRollDie}
          onRemoveDie={handleRemoveDie}
          onPlaySound={handlePlaySound}
          onUploadSound={handleUploadSound}
          onMutePlayer={handleMutePlayer}
          onUnmutePlayer={handleUnmutePlayer}
          onTransferHost={handleTransferHost}
        />
        {status !== 'connected' && (
          <div className="connection-banner" role="status">
            Connection lost — reconnecting…
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="pre-join">
      <h1>Custom Tabletop</h1>
      <p>
        {rejoining && lastJoinRef.current
          ? `Rejoining session ${lastJoinRef.current.sessionId}…`
          : connectionStatusLabel(status)}
      </p>
      {rejoining && (
        <button type="button" onClick={() => forgetSession(null)}>
          Cancel
        </button>
      )}
      {!rejoining && (
        <JoinForm
          disabled={status !== 'connected'}
          error={joinError}
          initialName={loadRememberedName(window.localStorage)}
          onJoin={handleJoin}
        />
      )}
    </main>
  );
}
