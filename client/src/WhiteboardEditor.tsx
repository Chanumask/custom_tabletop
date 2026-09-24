import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  WHITEBOARD_MAX_LINE_LENGTH,
  playerColorHex,
  type Player,
  type PlayerColorId,
  type WhiteboardLine,
} from '@custom-tabletop/shared';
import { inkColorFor, legibleInk } from './whiteboardInk.js';

/**
 * Writing on the whiteboard (change request #5): opened by aiming at the
 * board and pressing the interact key. One text field per board line; the
 * dot beside each shows the ink it will be in — the line's current author's
 * color while untouched, yours once you change it.
 *
 * Lines you haven't touched stay live (someone else saving while this is
 * open updates them here too), and saving sends only the lines you edited,
 * so two people writing at once never overwrite each other's lines.
 */
export function WhiteboardEditor({
  lines,
  players,
  selfColor,
  onSave,
  onClose,
}: {
  lines: WhiteboardLine[];
  players: Pick<Player, 'id' | 'color'>[];
  selfColor: PlayerColorId;
  onSave: (edits: (string | null)[]) => void;
  onClose: () => void;
}) {
  // One entry per line: the text you typed there, or null while untouched.
  const [edits, setEdits] = useState<(string | null)[]>(() => lines.map(() => null));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const firstEmpty = lines.findIndex((line) => !line.text);
    inputs.current[firstEmpty === -1 ? 0 : firstEmpty]?.focus();
    // Only on open — not whenever someone else saves while this is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function save() {
    onSave(edits.map((edit) => (edit === null ? null : edit.trimEnd())));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || index === lines.length - 1) {
      save();
    } else {
      inputs.current[index + 1]?.focus();
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="Whiteboard">
      <div className="whiteboard-editor">
        <p className="modal-title">Whiteboard</p>
        <p className="modal-hint">Enter for the next line · Ctrl+Enter to save · Esc to cancel</p>
        <ol className="whiteboard-lines">
          {lines.map((line, index) => {
            const edit = edits[index] ?? null;
            const text = edit ?? line.text;
            const unchanged = edit === null || edit.trimEnd() === line.text;
            const ink = unchanged
              ? line.text
                ? inkColorFor(line, players)
                : null
              : text.trim()
                ? legibleInk(playerColorHex(selfColor))
                : null;
            return (
              <li key={index}>
                <span
                  className="ink-dot"
                  style={{ background: ink ?? 'transparent' }}
                  aria-hidden="true"
                />
                <input
                  ref={(element) => {
                    inputs.current[index] = element;
                  }}
                  value={text}
                  maxLength={WHITEBOARD_MAX_LINE_LENGTH}
                  aria-label={`Line ${index + 1}`}
                  placeholder={index === 0 ? 'Write something for the table…' : ''}
                  style={{ color: ink ?? undefined }}
                  onChange={(event) =>
                    setEdits((current) =>
                      current.map((value, i) => (i === index ? event.target.value : value)),
                    )
                  }
                  onKeyDown={(event) => handleKeyDown(event, index)}
                />
              </li>
            );
          })}
        </ol>
        <div className="modal-actions">
          <button type="button" onClick={() => setEdits(lines.map(() => ''))}>
            Clear all
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save}>
            Save to board
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
