import type { GameState } from '@custom-tabletop/shared';

export interface SessionViewProps {
  state: GameState;
  playerId: string;
  onLeave: () => void;
}

export function SessionView({ state, playerId, onLeave }: SessionViewProps) {
  return (
    <div>
      <p>
        Session <strong>{state.sessionId}</strong>
      </p>
      <ul>
        {state.players.map((player) => (
          <li key={player.id}>
            {player.name}
            {player.id === state.hostId && ' (host)'}
            {player.id === playerId && ' (you)'}
          </li>
        ))}
      </ul>
      <button onClick={onLeave}>Leave session</button>
    </div>
  );
}
