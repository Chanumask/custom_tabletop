import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type SessionLeaveResponse,
  type SceneUpdateResponse,
  type DiceSpawnResponse,
  type DiceRollResponse,
  type DiceRemoveResponse,
  type SoundPlayRequest,
  type SoundPlayResponse,
  type SoundUploadResponse,
  type PlayerMuteResponse,
  type PlayerUnmuteResponse,
  type ObjectInteractResponse,
} from '@custom-tabletop/shared';
import { createSocket } from './socket.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';
import { getOrCreatePlayerId } from './playerIdentity.js';
import { JoinForm } from './JoinForm.js';
import { SessionView } from './SessionView.js';
import { RoomView } from './three/RoomView.js';
import { DIE_SIZE } from './three/DiceManager.js';
import { PLACEHOLDER_ROOM_LAYOUT } from './three/RoomLayout.js';
import { randomDiceSpawnPosition } from './diceSpawn.js';
import { playSound, setMasterVolume } from './sounds.js';
import { useSettings } from './useSettings.js';

interface JoinIntent {
  playerName: string;
  sessionId: string;
}

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Set once a join succeeds; re-used to auto-rejoin after a reconnect
  // (dropped tab/network blip), not just on the user's first submit.
  const lastJoinRef = useRef<JoinIntent | null>(null);
  // Mirrors `gameState` for the SoundPlay listener below, which is registered
  // once inside the mount effect and would otherwise close over a stale
  // (possibly null, possibly outdated) gameState when a sound:play broadcast
  // arrives later — including for sounds uploaded after that closure formed.
  const gameStateRef = useRef<GameState | null>(null);
  const [playerId] = useState(() => getOrCreatePlayerId(window.sessionStorage));
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

  const joinSession = useCallback(
    (socket: Socket, playerName: string, sessionId: string) => {
      setJoinError(null);
      socket.emit(
        SocketEvent.SessionJoin,
        { sessionId, playerId, playerName },
        (response: SessionJoinResponse) => {
          if (response.ok) {
            lastJoinRef.current = { playerName, sessionId };
            setGameState(response.state);
          } else {
            setJoinError(response.error);
          }
        },
      );
    },
    [playerId],
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      const lastJoin = lastJoinRef.current;
      if (lastJoin) {
        joinSession(socket, lastJoin.playerName, lastJoin.sessionId);
      }
    });

    socket.on(SocketEvent.SessionState, (state: GameState) => {
      setGameState((current) => (current?.sessionId === state.sessionId ? state : current));
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
  }, [joinSession]);

  function handleJoin(playerName: string, sessionId: string) {
    if (socketRef.current) {
      joinSession(socketRef.current, playerName, sessionId);
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
        lastJoinRef.current = null;
        setGameState(null);
      },
    );
  }

  function handleSetMapBackground(backgroundImage: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.SceneUpdate,
      {
        sessionId: gameState.sessionId,
        playerId,
        sceneId: gameState.activeSceneId,
        backgroundImage,
      },
      (response: SceneUpdateResponse) => {
        if (!response.ok) {
          console.error('Failed to update the map:', response.error);
        }
      },
    );
  }

  function handleSpawnDie() {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.DiceSpawn,
      {
        sessionId: gameState.sessionId,
        playerId,
        diceId: crypto.randomUUID(),
        position: randomDiceSpawnPosition(PLACEHOLDER_ROOM_LAYOUT, DIE_SIZE),
      },
      (response: DiceSpawnResponse) => {
        if (!response.ok) {
          console.error('Failed to spawn a die:', response.error);
        }
      },
    );
  }

  function handleRollDie(diceId: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.DiceRoll,
      { sessionId: gameState.sessionId, playerId, diceId },
      (response: DiceRollResponse) => {
        if (!response.ok) {
          console.error('Failed to roll the die:', response.error);
        }
      },
    );
  }

  function handleRemoveDie(diceId: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.DiceRemove,
      { sessionId: gameState.sessionId, playerId, diceId },
      (response: DiceRemoveResponse) => {
        if (!response.ok) {
          console.error('Failed to remove the die:', response.error);
        }
      },
    );
  }

  function handlePlaySound(soundId: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.SoundPlay,
      { sessionId: gameState.sessionId, playerId, soundId },
      (response: SoundPlayResponse) => {
        if (!response.ok) {
          console.error('Failed to play sound:', response.error);
        }
      },
    );
  }

  function handleUploadSound(name: string, url: string, slotIndex?: number) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.SoundUpload,
      {
        sessionId: gameState.sessionId,
        playerId,
        soundId: crypto.randomUUID(),
        name,
        url,
        slotIndex,
      },
      (response: SoundUploadResponse) => {
        if (!response.ok) {
          console.error('Failed to upload sound:', response.error);
        }
      },
    );
  }

  function handleObjectInteract(objectId: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.ObjectInteract,
      { sessionId: gameState.sessionId, playerId, objectId },
      (response: ObjectInteractResponse) => {
        if (!response.ok) {
          console.error('Failed to interact:', response.error);
        }
      },
    );
  }

  function handleMutePlayer(targetPlayerId: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.PlayerMute,
      { sessionId: gameState.sessionId, playerId, targetPlayerId },
      (response: PlayerMuteResponse) => {
        if (!response.ok) {
          console.error('Failed to mute player:', response.error);
        }
      },
    );
  }

  function handleUnmutePlayer(targetPlayerId: string) {
    const socket = socketRef.current;
    if (!socket || !gameState) {
      return;
    }

    socket.emit(
      SocketEvent.PlayerUnmute,
      { sessionId: gameState.sessionId, playerId, targetPlayerId },
      (response: PlayerUnmuteResponse) => {
        if (!response.ok) {
          console.error('Failed to unmute player:', response.error);
        }
      },
    );
  }

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
        <div className="session-overlay">
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
          />
        </div>
      </main>
    );
  }

  return (
    <main className="pre-join">
      <h1>Custom Tabletop</h1>
      <p>{connectionStatusLabel(status)}</p>
      <JoinForm disabled={status !== 'connected'} error={joinError} onJoin={handleJoin} />
    </main>
  );
}
