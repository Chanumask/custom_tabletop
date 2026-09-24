import { useEffect, useState } from 'react';
import type { SoundState } from '@custom-tabletop/shared';
import { AddSoundForm } from './AddSoundForm.js';

export interface SoundboardAssignMenuProps {
  slotIndex: number;
  soundboard: SoundState[];
  /** What the button plays right now (null = empty). */
  currentSoundId: string | null;
  /** Put an existing soundboard entry on this button, or clear it (null). */
  onAssignExisting: (soundId: string | null) => void;
  /** Register a brand-new sound and put it on this button. */
  onAddNew: (name: string, url: string) => void;
  onClose: () => void;
}

/**
 * The overlay for configuring one wall-board button (`SoundboardWall.ts`) —
 * opened by pressing the interact key on an empty button, or Shift + the
 * interact key on a filled one. Any player can pick a sound already on the
 * soundboard, add a new one by link (audio file or YouTube) or upload, or
 * clear the button. A DOM overlay over the WebGL canvas, same as the
 * drawing toolbar; the caller releases pointer lock before showing it (a
 * locked mouse can't click a text field) and doesn't re-lock after.
 */
export function SoundboardAssignMenu({
  slotIndex,
  soundboard,
  currentSoundId,
  onAssignExisting,
  onAddNew,
  onClose,
}: SoundboardAssignMenuProps) {
  const [picked, setPicked] = useState(currentSoundId ?? '');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="soundboard-assign-menu" role="dialog" aria-label="Wall board button">
      <p className="soundboard-assign-menu-title">Button {slotIndex + 1}</p>

      <div className="assign-existing">
        <label>
          Play a sound from the board
          <select value={picked} onChange={(event) => setPicked(event.target.value)}>
            <option value="">— choose a sound —</option>
            {soundboard.map((sound) => (
              <option key={sound.id} value={sound.id}>
                {sound.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!picked || picked === currentSoundId}
          onClick={() => onAssignExisting(picked)}
        >
          Use it
        </button>
      </div>

      <p className="soundboard-assign-menu-divider">or add a new one</p>
      <AddSoundForm onAdd={onAddNew} autoFocusLink={currentSoundId === null} />

      <div className="assign-actions">
        {currentSoundId !== null && (
          <button type="button" onClick={() => onAssignExisting(null)}>
            Clear this button
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
