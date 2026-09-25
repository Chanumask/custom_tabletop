import { io, type Socket } from 'socket.io-client';

/** In dev, Vite (5173) and the server (3001) are separate; a production
 * build is served by the server itself, so it talks to its own origin. */
function defaultServerUrl(): string {
  if (import.meta.env.DEV || typeof window === 'undefined') {
    return 'http://localhost:3001';
  }
  return window.location.origin;
}

// Exported so other modules that need the backend's origin directly (e.g.
// uploads.ts's REST calls) don't duplicate this env-var fallback.
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? defaultServerUrl();

export function createSocket(): Socket {
  return io(SERVER_URL);
}
