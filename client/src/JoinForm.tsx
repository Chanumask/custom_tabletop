import { useState, type FormEvent } from 'react';
import { generateSessionCode } from './sessionCode.js';

export interface JoinFormProps {
  disabled: boolean;
  error: string | null;
  /** Pre-filled so a returning player doesn't retype their name. */
  initialName: string;
  onJoin: (playerName: string, sessionId: string) => void;
}

export function JoinForm({ disabled, error, initialName, onJoin }: JoinFormProps) {
  const [name, setName] = useState(initialName);
  const [sessionId, setSessionId] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const code = sessionId.trim() || generateSessionCode();
    onJoin(name.trim(), code);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>
          Your name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
      </div>
      <div>
        <label>
          Session code
          <input
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value.toUpperCase())}
            placeholder="leave blank to host a new session"
          />
        </label>
        <button type="button" onClick={() => setSessionId(generateSessionCode())}>
          Generate
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={disabled || name.trim().length === 0}>
        Join
      </button>
    </form>
  );
}
