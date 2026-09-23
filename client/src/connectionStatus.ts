export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Pure so it's testable without touching the DOM or a real socket. */
export function connectionStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'connecting':
      return 'Connecting to server…';
    case 'connected':
      return 'Connected to server';
    case 'disconnected':
      return 'Disconnected from server';
  }
}
