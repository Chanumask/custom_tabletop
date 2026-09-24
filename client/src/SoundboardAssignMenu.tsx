import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { uploadSound } from './uploads.js';
import { deriveNameFromUrl } from './soundName.js';

export interface SoundboardAssignMenuProps {
  onAssign: (name: string, url: string) => void;
  onClose: () => void;
}

/**
 * The overlay opened by pressing the interact key on an empty wall-board
 * button (`SoundboardWall.ts`, Milestone 8 follow-up) — lets any player
 * attach a sound to that slot via a direct link or a file upload, the same
 * two paths the 2D panel's soundboard tab already offers (`SessionView.tsx`),
 * just reachable from inside the room instead of the side menu. Rendered as
 * a DOM overlay over the WebGL canvas, same pattern as the drawing toolbar
 * and interaction prompt in `RoomView.tsx`. The caller is responsible for
 * releasing pointer lock before showing this (a locked mouse can't click a
 * text field) and not re-locking after it closes, matching every other
 * unlocked state in this app.
 */
export function SoundboardAssignMenu({ onAssign, onClose }: SoundboardAssignMenuProps) {
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleSubmitUrl(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    onAssign(deriveNameFromUrl(trimmed), trimmed);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploadedUrl = await uploadSound(file);
      onAssign(file.name.replace(/\.[^./]+$/, ''), uploadedUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="soundboard-assign-menu">
      <p className="soundboard-assign-menu-title">Add a sound to this button</p>
      <form onSubmit={handleSubmitUrl}>
        <label>
          Direct link to an audio file
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…/sound.mp3"
            autoFocus
          />
        </label>
        <button type="submit">Add</button>
      </form>
      <label>
        or upload a file
        <input type="file" accept="audio/*" onChange={(event) => void handleFileChange(event)} />
      </label>
      {uploading && <p>Uploading…</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
