import { useState, type FormEvent } from 'react';
import type { GameState } from '@custom-tabletop/shared';

export interface SessionViewProps {
  state: GameState;
  playerId: string;
  onLeave: () => void;
  onSetMapBackground: (url: string) => void;
}

export function SessionView({ state, playerId, onLeave, onSetMapBackground }: SessionViewProps) {
  const isHost = playerId === state.hostId;
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  const [backgroundUrl, setBackgroundUrl] = useState('');

  function handleSetMap(event: FormEvent) {
    event.preventDefault();
    onSetMapBackground(backgroundUrl.trim());
  }

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
      {isHost && (
        <form onSubmit={handleSetMap}>
          <label>
            Map background URL
            <input
              value={backgroundUrl}
              onChange={(event) => setBackgroundUrl(event.target.value)}
              placeholder={activeScene?.backgroundImage || 'leave blank for a plain map'}
            />
          </label>
          <button type="submit">Set map</button>
        </form>
      )}
      <button onClick={onLeave}>Leave session</button>
    </div>
  );
}
