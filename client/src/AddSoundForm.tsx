import { useState, type ChangeEvent, type FormEvent } from 'react';
import { uploadSound } from './uploads.js';
import { resolveSoundLink } from './soundLinks.js';

/**
 * "Add a sound" — upload a file, or paste a link (a direct audio file or a
 * YouTube video). Links are checked *before* anything is added
 * (soundLinks.ts), so a dead link or a web page shows a clear error here
 * instead of silently playing nothing for everyone later. Used by the
 * session menu's Sound tab and the wall board's assign menu.
 */
export function AddSoundForm({
  onAdd,
  autoFocusLink = false,
}: {
  onAdd: (name: string, url: string) => void;
  autoFocusLink?: boolean;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<'upload' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setBusy('upload');
    setError(null);
    try {
      const url = await uploadSound(file);
      onAdd(file.name.replace(/\.[^./]+$/, ''), url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(null);
    }
  }

  async function handleLink(event: FormEvent) {
    event.preventDefault();
    if (!link.trim() || busy) {
      return;
    }
    setBusy('link');
    setError(null);
    const result = await resolveSoundLink(link);
    setBusy(null);
    if (result.ok) {
      onAdd(result.name, result.url);
      setLink('');
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="add-sound">
      <form onSubmit={(event) => void handleLink(event)}>
        <label>
          Paste a link — an audio file (.mp3/.wav/.ogg) or a YouTube video
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://…"
            autoFocus={autoFocusLink}
            disabled={busy !== null}
          />
        </label>
        <button type="submit" disabled={busy !== null || !link.trim()}>
          {busy === 'link' ? 'Checking link…' : 'Add link'}
        </button>
      </form>
      <label className="file-label">
        or upload a file
        <input
          type="file"
          accept="audio/*"
          disabled={busy !== null}
          onChange={(event) => void handleFile(event)}
        />
      </label>
      {busy === 'upload' && <p className="add-sound-note">Uploading…</p>}
      {error && (
        <p className="add-sound-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
