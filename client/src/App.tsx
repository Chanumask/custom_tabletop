import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  SocketEvent,
  type GameState,
  type SessionJoinResponse,
  type SessionLeaveResponse,
} from '@custom-tabletop/shared';
import { createSocket } from './socket.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';
import { getOrCreatePlayerId } from './playerIdentity.js';
import { JoinForm } from './JoinForm.js';
import { SessionView } from './SessionView.js';
import { RoomView } from './three/RoomView.js';

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
  const [playerId] = useState(() => getOrCreatePlayerId(window.sessionStorage));

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

  if (gameState) {
    return (
      <main className="game-shell">
        <RoomView />
        <div className="session-overlay">
          <SessionView state={gameState} playerId={playerId} onLeave={handleLeave} />
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
