import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BOOK_COVERS,
  MAX_BOOK_TEXT,
  MAX_BOOK_TITLE,
  MAX_BOOKS,
  type Book,
} from '@custom-tabletop/shared';
import { HANDBOOK, paragraphs } from './handbook.js';

type View = { kind: 'shelf' } | { kind: 'read'; book: Book } | { kind: 'write'; book: Book | null };

/**
 * The lectern's books (Lectern.ts): a guide to the room that's always
 * there, and whatever the host has written (books.ts) — for everyone to
 * read. The host writes, rewrites and takes away books here too.
 */
export function BookshelfDialog({
  books,
  isHost,
  onWrite,
  onRemove,
  onClose,
}: {
  books: readonly Book[];
  isHost: boolean;
  onWrite: (book: { bookId?: string; title: string; text: string; cover: number }) => void;
  onRemove: (bookId: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>({ kind: 'shelf' });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      // Esc steps back out of a book first, then closes.
      if (view.kind === 'shelf') onClose();
      else setView({ kind: 'shelf' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, view.kind]);

  const shelf = [HANDBOOK, ...books];
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="The lectern's books">
      <div className={view.kind === 'shelf' ? 'book-dialog' : 'book-dialog open'}>
        {view.kind === 'shelf' && (
          <>
            <p className="modal-title">The books by the shelf</p>
            <ul className="book-list" aria-label="Books">
              {shelf.map((book) => (
                <li key={book.id} className="book-row">
                  <button
                    type="button"
                    className="book-choice"
                    onClick={() => setView({ kind: 'read', book })}
                  >
                    <span
                      className="book-spine"
                      style={{ background: BOOK_COVERS[book.cover % BOOK_COVERS.length] }}
                      aria-hidden
                    />
                    <span className="book-title">{book.title}</span>
                  </button>
                  {isHost && book.id !== HANDBOOK.id && (
                    <span className="book-actions">
                      <button type="button" onClick={() => setView({ kind: 'write', book })}>
                        Rewrite
                      </button>
                      <button
                        type="button"
                        className={confirmRemove === book.id ? 'danger' : undefined}
                        onClick={() => {
                          if (confirmRemove === book.id) {
                            onRemove(book.id);
                            setConfirmRemove(null);
                          } else {
                            setConfirmRemove(book.id);
                          }
                        }}
                      >
                        {confirmRemove === book.id ? 'Really remove?' : 'Remove'}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {isHost && (
              <p className="settings-hint">
                {books.length < MAX_BOOKS
                  ? 'Only you can write here — everyone can read.'
                  : `The lectern holds ${MAX_BOOKS} books; take one away to write another.`}
              </p>
            )}
            <div className="modal-actions">
              {isHost && books.length < MAX_BOOKS && (
                <button type="button" onClick={() => setView({ kind: 'write', book: null })}>
                  Write a new book
                </button>
              )}
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
        {view.kind === 'read' && (
          <>
            <article className="book-page" aria-label={view.book.title}>
              <h2>{view.book.title}</h2>
              {paragraphs(view.book.text).map((paragraph, i) =>
                paragraph.heading ? (
                  <h3 key={i}>{paragraph.text}</h3>
                ) : (
                  <p key={i}>{paragraph.text}</p>
                ),
              )}
              {!view.book.text.trim() && <p className="book-empty">The pages are still blank.</p>}
            </article>
            <div className="modal-actions">
              <button type="button" onClick={() => setView({ kind: 'shelf' })}>
                Back to the books
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
        {view.kind === 'write' && (
          <BookEditor
            book={view.book}
            onSave={(book) => {
              onWrite(book);
              setView({ kind: 'shelf' });
            }}
            onCancel={() => setView({ kind: 'shelf' })}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function BookEditor({
  book,
  onSave,
  onCancel,
}: {
  book: Book | null;
  onSave: (book: { bookId?: string; title: string; text: string; cover: number }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(book?.title ?? '');
  const [text, setText] = useState(book?.text ?? '');
  const [cover, setCover] = useState(book?.cover ?? 0);
  return (
    <form
      className="book-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onSave({ ...(book ? { bookId: book.id } : {}), title: title.trim(), text, cover });
      }}
    >
      <p className="modal-title">{book ? 'Rewrite the book' : 'Write a new book'}</p>
      <label className="book-field">
        <span>Title</span>
        <input
          value={title}
          maxLength={MAX_BOOK_TITLE}
          placeholder="The Lost Mines of Emberfall"
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="book-field">
        <span>Cover</span>
        <div className="book-covers" role="radiogroup" aria-label="Cover">
          {BOOK_COVERS.map((color, i) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={cover === i}
              aria-label={`Cover ${i + 1}`}
              className={cover === i ? 'book-cover active' : 'book-cover'}
              style={{ background: color }}
              onClick={() => setCover(i)}
            />
          ))}
        </div>
      </div>
      <label className="book-field">
        <span>
          Text <small>— a blank line starts a new paragraph; “# ” starts a heading</small>
        </span>
        <textarea
          value={text}
          maxLength={MAX_BOOK_TEXT}
          rows={12}
          onChange={(event) => setText(event.target.value)}
        />
        <small className="book-count">
          {text.length} / {MAX_BOOK_TEXT}
        </small>
      </label>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={!title.trim()}>
          {book ? 'Save' : 'Put it on the lectern'}
        </button>
      </div>
    </form>
  );
}
