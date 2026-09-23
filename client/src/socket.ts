import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export function createSocket(): Socket {
  return io(SERVER_URL);
}
