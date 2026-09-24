import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_COLORS,
  playerColorHex,
  type PlayerColorId,
  type SessionPeekResponse,
} from '@custom-tabletop/shared';
import { generateSessionCode, normalizeSessionCodeInput } from './sessionCode.js';
import { ColorPicker } from './ColorPicker.js';
import { describeJoinStatus, type JoinMode } from './joinStatus.js';
import { connectionStatusLabel, type ConnectionStatus } from './connectionStatus.js';
import { CHARACTER_TITLES } from './three/characters.js';
import { CharacterPreview } from './three/CharacterPreview.js';

export interface JoinFormProps {
  connection: ConnectionStatus;
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

/**
 * The join screen (change request #6): your character on the left, the form
 * on the right. Two deliberate flows — host a new table (with a generated,
 * editable code) or join one by code / pasted invite link — plus name and
 * color. The code is "peeked" live (`session:peek`), so the player sees
 * who's at a table and which colors are taken *before* joining, and the
 * primary action says exactly what will happen.
 */
export function JoinForm({
  connection,
  error,
  initialName,
  initialColor,
  inviteCode,
  onPeek,
  onJoin,
}: JoinFormProps) {
  const [mode, setMode] = useState<JoinMode>(inviteCode ? 'join' : 'host');
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<PlayerColorId>(initialColor);
  const [hostCode, setHostCode] = useState(generateSessionCode);
  const [joinCode, setJoinCode] = useState(inviteCode ?? '');
  const [peek, setPeek] = useState<{ code: string; result: SessionPeekResponse } | null>(null);

  const code = mode === 'host' ? hostCode : joinCode;
  const offline = connection !== 'connected';

  useEffect(() => {
    if (!code || offline) {
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
  }, [code, offline, onPeek]);

  // Only trust a peek for the code currently on screen.
  const current = peek && peek.code === code ? peek.result : null;
  const status = describeJoinStatus(mode, code, current);
  const taken = useMemo(
    () => new Set<PlayerColorId>(mode === 'join' && current ? current.takenColors : []),
    [mode, current],
  );

  // If the chosen color turns out to be taken at the table being joined,
  // move to the first free one rather than letting the server surprise them.
  useEffect(() => {
    if (taken.has(color)) {
      const free = PLAYER_COLORS.find((candidate) => !taken.has(candidate.id));
      if (free) {
        setColor(free.id);
      }
    }
  }, [taken, color]);

  const trimmedName = name.trim();
  const canSubmit = !offline && !status.blocked && trimmedName.length > 0 && code.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) {
      onJoin(trimmedName, code, color);
    }
  }

  function joinExisting() {
    setJoinCode(hostCode);
    setMode('join');
  }

  const accent = { '--accent': playerColorHex(color) } as CSSProperties;

  return (
    <div className="join-layout" style={accent}>
      <section className="join-hero">
        <CharacterPreview color={color} />
        <p className="character-caption">
          <span className="character-name">{trimmedName || 'You'}</span>
          <span className="character-title">{CHARACTER_TITLES[color]}</span>
        </p>
        <p className="character-hint" aria-hidden="true">
          Drag to spin
        </p>
      </section>

      <form className="join-card" onSubmit={handleSubmit}>
        <header className="join-brand">
          <BrandMark />
          <div>
            <h1>Custom Tabletop</h1>
            <p>Pull up a chair — your table is one code away.</p>
          </div>
        </header>

        <div className="join-mode-switch" role="tablist" aria-label="Host or join" data-mode={mode}>
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
          <span className="join-label">Your name</span>
          <input
            value={name}
            maxLength={MAX_PLAYER_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="What should the table call you?"
            autoFocus={!initialName && !inviteCode}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <div className="join-field">
          <span className="join-label">Your character</span>
          <ColorPicker value={color} taken={taken} onChange={setColor} label="Your color" />
        </div>

        <div className="join-field">
          <label className="join-label" htmlFor="session-code">
            {mode === 'host' ? 'Your session code' : 'Session code or invite link'}
          </label>
          <span className="code-row">
            {mode === 'host' ? (
              <>
                <input
                  id="session-code"
                  className="code-input"
                  value={hostCode}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setHostCode(normalizeSessionCodeInput(event.target.value))}
                />
                <button
                  type="button"
                  className="code-reroll"
                  title="Generate a new code"
                  aria-label="Generate a new code"
                  onClick={() => setHostCode(generateSessionCode())}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
                  </svg>
                </button>
              </>
            ) : (
              <input
                id="session-code"
                className="code-input"
                value={joinCode}
                placeholder="ABCDE"
                spellCheck={false}
                autoComplete="off"
                autoFocus={!!initialName && !inviteCode}
                onChange={(event) => setJoinCode(normalizeSessionCodeInput(event.target.value))}
              />
            )}
          </span>
        </div>

        {status.message && (
          <p className={`join-status ${status.tone}`} role="status">
            {status.present.length > 0 && (
              <span className="join-present" aria-hidden="true">
                {status.present.map((id) => (
                  <span key={id} style={{ background: playerColorHex(id) }} />
                ))}
              </span>
            )}
            <span>{status.message}</span>
            {mode === 'host' && current?.exists && (
              <button type="button" className="link-button" onClick={joinExisting}>
                Join it instead
              </button>
            )}
          </p>
        )}
        {error && (
          <p className="join-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="join-submit" disabled={!canSubmit}>
          {mode === 'host' ? 'Create session' : 'Join session'}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <footer className="join-footer">
          <span className={`connection-pill ${connection}`} role="status">
            <span className="connection-dot" aria-hidden="true" />
            {connectionStatusLabel(connection)}
          </span>
        </footer>
      </form>
    </div>
  );
}

/** A d20 — the app's mark (also its favicon, see index.html). */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path className="brand-mark-body" d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" />
      <path
        className="brand-mark-edges"
        d="M32 16 15 43h34ZM32 3v13M7 17.5 32 16l25 1.5M7 17.5 15 43l-8 3.5M15 43l17 18 17-18 8 3.5M57 17.5 49 43"
      />
      <text x="32" y="38" textAnchor="middle">
        20
      </text>
    </svg>
  );
}
