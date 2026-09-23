import { io, type Socket } from 'socket.io-client';

// Exported so other modules that need the backend's origin directly (e.g.
// uploads.ts's REST calls) don't duplicate this env-var fallback.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export function createSocket(): Socket {
  return io(SERVER_URL);
}
