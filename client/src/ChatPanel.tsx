import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MAX_CHAT_LENGTH,
  playerColorHex,
  type LogEntry,
  type Player,
} from '@custom-tabletop/shared';
import { isTypingTarget } from './keyboard.js';
import { feedEntries, rollBreakdown, rollFlavor, rollSummary } from './logFormat.js';

/** Dispatched on window to hand the mouse back to the room's mouse-look
 * (RoomView listens) after chatting from a walking, pointer-locked view. */
export const RESUME_LOOK_EVENT = 'tabletop:resume-look';

/** How long a new line stays in the collapsed feed, and when it fades. */
const FEED_SECONDS = 12;
const FADE_FROM_SECONDS = 9;
const FEED_LINES = 6;

export interface ChatPanelProps {
  log: LogEntry[];
  players: Pick<Player, 'id' | 'name' | 'color'>[];
  /** Sends a chat line (or /roll); resolves false if it was refused. */
  onSend: (text: string) => Promise<boolean>;
}

/**
 * The session log, bottom-left: chat, every dice roll (with its breakdown
 * and total), and who came and went. Collapsed, it's a short feed of the
 * newest lines that fade away after a few seconds; Enter (anywhere in the
 * room) opens it to type — and from a walking view, sending hands the
 * mouse straight back to looking around. `/roll 2d6+3` rolls in chat.
 */
export function ChatPanel({ log, players, onSend }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const resumeLookRef = useRef(false);
  // When *this client* first saw each entry — the server's timestamps are
  // on the server's clock, so they can't drive a client-side fade. Lines
  // already in the log when the panel mounts count as old news.
  const seenAtRef = useRef<Map<string, number> | null>(null);
  if (seenAtRef.current === null) {
    seenAtRef.current = new Map(log.map((entry) => [entry.id, -Infinity]));
  }
  const seenAt = seenAtRef.current;
  const now = performance.now();
  for (const entry of log) {
    if (!seenAt.has(entry.id)) {
      seenAt.set(entry.id, now);
    }
  }

  // Enter opens the chat from the room (not while typing somewhere else,
  // and not over a dialog, which owns Enter itself).
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        open ||
        event.repeat ||
        isTypingTarget(event.target) ||
        document.querySelector('.modal-backdrop, .soundboard-assign-menu')
      ) {
        return;
      }
      event.preventDefault();
      resumeLookRef.current = document.pointerLockElement !== null;
      if (resumeLookRef.current) {
        document.exitPointerLock();
      }
      setOpen(true);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // Newest line in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [log.length, open]);

  // While collapsed, re-render now and then so lines can fade out.
  useEffect(() => {
    if (open) {
      return;
    }
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [open]);

  function close(resumeLook: boolean) {
    setOpen(false);
    inputRef.current?.blur();
    if (resumeLook && resumeLookRef.current) {
      window.dispatchEvent(new Event(RESUME_LOOK_EVENT));
    }
    resumeLookRef.current = false;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    // Close right away (it feels instant); bring the text back if refused.
    setDraft('');
    close(true);
    if (text) {
      void onSend(text).then((ok) => {
        if (!ok) {
          setDraft(text);
        }
      });
    }
  }

  const visible = open ? log : feedEntries(log, seenAt, now, FEED_SECONDS, FEED_LINES);

  return (
    <section className={`chat-panel${open ? ' open' : ''}`} aria-label="Table chat">
      {visible.length > 0 && (
        <ol className="chat-log" ref={listRef} aria-live="polite">
          {visible.map((entry) => {
            const age = (now - (seenAt.get(entry.id) ?? -Infinity)) / 1000;
            return (
              <li
                key={entry.id}
                className={`chat-line ${entry.kind}${!open && age > FADE_FROM_SECONDS ? ' fading' : ''}`}
              >
                <LogLine entry={entry} players={players} />
              </li>
            );
          })}
        </ol>
      )}
      {open ? (
        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Say something… or /roll 2d6+3"
            aria-label="Chat message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
              }
            }}
            onBlur={() => {
              // Clicking away (e.g. back into the room) just closes it.
              if (open) setOpen(false);
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          className="chat-open"
          onClick={() => {
            resumeLookRef.current = false;
            setOpen(true);
          }}
        >
          <kbd>Enter</kbd> Chat
        </button>
      )}
    </section>
  );
}

function LogLine({
  entry,
  players,
}: {
  entry: LogEntry;
  players: Pick<Player, 'id' | 'name' | 'color'>[];
}) {
  if (entry.kind === 'system') {
    return <span className="chat-system">{entry.text}</span>;
  }
  // Their current name and color while they're here; as-they-were after.
  const author = players.find((player) => player.id === entry.playerId) ?? entry;
  const name = (
    <span className="chat-name" style={{ color: playerColorHex(author.color) }}>
      {author.name}
    </span>
  );
  if (entry.kind === 'chat') {
    return (
      <>
        {name} <span className="chat-text">{entry.text}</span>
      </>
    );
  }
  if (entry.kind === 'radio') {
    return (
      <>
        <span aria-hidden="true">📻 </span>
        {name} <span className="chat-text">{entry.text}</span>
      </>
    );
  }
  const flavor = rollFlavor(entry);
  const single = entry.dice.length === 1 && !entry.modifier;
  return (
    <>
      <span aria-hidden="true">🎲 </span>
      {entry.visibleTo && <span className="secret-tag">secret</span>}
      {name} rolled {rollSummary(entry)}
      {!single && <span className="chat-breakdown"> ({rollBreakdown(entry)})</span>}
      {': '}
      <strong className={`chat-total${flavor ? ` ${flavor}` : ''}`}>{entry.total}</strong>
      {flavor === 'critical' && <span className="chat-flavor"> Natural 20!</span>}
      {flavor === 'fumble' && <span className="chat-flavor fumble"> Natural 1…</span>}
    </>
  );
}
