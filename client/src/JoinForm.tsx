import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS_PER_SESSION,
  PLAYER_COLORS,
  type PlayerColorId,
  type SessionPeekResponse,
} from '@custom-tabletop/shared';
import { generateSessionCode } from './sessionCode.js';
import { ColorPicker } from './ColorPicker.js';

type Mode = 'host' | 'join';

export interface JoinFormProps {
  disabled: boolean;
  error: string | null;
  /** Pre-filled so a returning player doesn't retype their name. */
  initialName: string;
  initialColor: PlayerColorId;
  /** From an invite link (`?join=CODE`) — opens straight into join mode. */
  inviteCode: string | null;
  onPeek: (sessionId: string) => Promise<SessionPeekResponse>;
  onJoin: (playerName: string, sessionId: string, color: PlayerColorId) => void;
}

const PEEK_DEBOUNCE_MS = 250;

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

/**
 * The join screen's form: two deliberate flows — host a new session (with
 * a generated, editable code) or join an existing one by code — plus name
 * and color. The code is "peeked" live (`session:peek`) so the player sees
 * who's in a session and which colors are taken *before* joining, and the
 * primary action explains exactly what will happen.
 */
export function JoinForm({
  disabled,
  error,
  initialName,
  initialColor,
  inviteCode,
  onPeek,
  onJoin,
}: JoinFormProps) {
  const [mode, setMode] = useState<Mode>(inviteCode ? 'join' : 'host');
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<PlayerColorId>(initialColor);
  const [hostCode, setHostCode] = useState(generateSessionCode);
  const [joinCode, setJoinCode] = useState(inviteCode ?? '');
  const [peek, setPeek] = useState<{ code: string; result: SessionPeekResponse } | null>(null);

  const code = mode === 'host' ? hostCode : joinCode;

  useEffect(() => {
    if (!code || disabled) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void onPeek(code).then((result) => {
        if (!cancelled) {
          setPeek({ code, result });
        }
      });
    }, PEEK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, disabled, onPeek]);

  // Only trust a peek for the code currently on screen.
  const current = peek && peek.code === code ? peek.result : null;
  const taken = useMemo(
    () => new Set<PlayerColorId>(mode === 'join' && current ? current.takenColors : []),
    [mode, current],
  );

  // If the chosen color turns out to be taken in the session being joined,
  // move to the first free one rather than letting the server surprise them.
  useEffect(() => {
    if (taken.has(color)) {
      const free = PLAYER_COLORS.find((candidate) => !taken.has(candidate.id));
      if (free) {
        setColor(free.id);
      }
    }
  }, [taken, color]);

  let status: string | null = null;
  let blocked = false;
  if (mode === 'join') {
    if (!joinCode) {
      status = 'Enter the code your host shared with you.';
      blocked = true;
    } else if (!current) {
      status = 'Looking up session…';
      blocked = true;
    } else if (!current.exists) {
      status = 'No session with that code — check it, or host a new one.';
      blocked = true;
    } else if (current.playerCount >= MAX_PLAYERS_PER_SESSION) {
      status = `That session is full (${MAX_PLAYERS_PER_SESSION} players).`;
      blocked = true;
    } else {
      const players = `${current.playerCount} player${current.playerCount === 1 ? '' : 's'}`;
      status = current.hostName ? `${players} · hosted by ${current.hostName}` : players;
    }
  } else if (current?.exists) {
    status = 'That code is already in use — pick another.';
    blocked = true;
  }

  const trimmedName = name.trim();
  const canSubmit = !disabled && !blocked && trimmedName.length > 0 && code.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) {
      onJoin(trimmedName, code, color);
    }
  }

  return (
    <form className="join-form" onSubmit={handleSubmit}>
      <div className="join-mode-switch" role="tablist" aria-label="Host or join">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'host'}
          className={mode === 'host' ? 'active' : ''}
          onClick={() => setMode('host')}
        >
          Host a session
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'join'}
          className={mode === 'join' ? 'active' : ''}
          onClick={() => setMode('join')}
        >
          Join with a code
        </button>
      </div>

      <label className="join-field">
        <span>Your name</span>
        <input
          value={name}
          maxLength={MAX_PLAYER_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="What should the table call you?"
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>

      <div className="join-field">
        <span>Your color</span>
        <ColorPicker value={color} taken={taken} onChange={setColor} label="Your color" />
      </div>

      {mode === 'host' ? (
        <label className="join-field">
          <span>Session code</span>
          <span className="code-row">
            <input
              className="code-input"
              value={hostCode}
              maxLength={12}
              onChange={(event) => setHostCode(normalizeCode(event.target.value))}
            />
            <button
              type="button"
              className="code-reroll"
              title="Generate a new code"
              onClick={() => setHostCode(generateSessionCode())}
            >
              ↻
            </button>
          </span>
        </label>
      ) : (
        <label className="join-field">
          <span>Session code</span>
          <input
            className="code-input"
            value={joinCode}
            maxLength={12}
            placeholder="ABCDE"
            autoFocus={!inviteCode}
            onChange={(event) => setJoinCode(normalizeCode(event.target.value))}
          />
        </label>
      )}

      {status && (
        <p className={`join-status${blocked && mode === 'join' && joinCode ? ' warn' : ''}`}>
          {status}
        </p>
      )}
      {error && (
        <p className="join-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="join-submit" disabled={!canSubmit}>
        {mode === 'host' ? 'Create session' : 'Join session'}
      </button>
    </form>
  );
}
