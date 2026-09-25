import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { MAX_CHAT_LENGTH } from '@custom-tabletop/shared';

export interface WalkieDialogProps {
  onSend: (text: string) => void;
  onClose: () => void;
}

/**
 * The walkie-talkie's push-to-talk message (gadgets phase 4) — opened by
 * pressing R while holding one. A private channel, not a chat message: the
 * server only ever delivers it (and only ever puts it in `log` at all) to
 * whoever else currently holds the other walkie (server/src/privacy.ts) —
 * there's no client-side filtering to get right or wrong here.
 */
export function WalkieDialog({ onSend, onClose }: WalkieDialogProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed) {
      onSend(trimmed);
    }
    onClose();
  }

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="Walkie-talkie">
      <form className="walkie-dialog" onSubmit={submit}>
        <p className="modal-title">📻 Walkie-talkie</p>
        <p className="modal-hint">Only whoever else is holding one hears this.</p>
        <input
          ref={inputRef}
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Say something…"
          aria-label="Radio message"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!text.trim()}>
            Transmit
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
