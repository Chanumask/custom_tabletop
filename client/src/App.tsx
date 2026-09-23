import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ConnectionEvent } from '@custom-tabletop/shared';
import { createSocket } from './socket.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [roundTripOk, setRoundTripOk] = useState(false);

  useEffect(() => {
    const socket: Socket = createSocket();

    socket.on('connect', () => {
      setStatus('connected');
      socket.emit(ConnectionEvent.Ping, { at: Date.now() });
    });

    socket.on(ConnectionEvent.Pong, () => {
      setRoundTripOk(true);
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      setRoundTripOk(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main>
      <h1>Custom Tabletop</h1>
      <p>{connectionStatusLabel(status)}</p>
      {status === 'connected' && <p>Round trip: {roundTripOk ? 'ok' : 'waiting…'}</p>}
    </main>
  );
}
