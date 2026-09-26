import { useEffect, useState, type ChangeEvent } from 'react';
import {
  PROFILE_IMAGE_ACCEPT,
  PROFILE_IMAGE_FORMATS,
  formatBytes,
  type ImageInspection,
} from '@custom-tabletop/shared';
import { checkProfileFile } from './profileImages.js';
import { SheetIcon } from './icons.js';

/**
 * The join screen's profile image (docs/decisions.md, "Player profiles"):
 * optional; the copy this device keeps is offered first, and any file is
 * checked here by the server's own rules before the player joins, so a
 * wrong one is caught while they can still fix it. Reports the image to
 * share (or null) through `onChange` — shared once the join goes through.
 */
export function JoinProfileField({
  deviceCopy,
  keepCopy,
  onKeepCopyChange,
  onChange,
}: {
  /** The copy this device keeps (undefined while it's being looked up). */
  deviceCopy: Blob | null | undefined;
  keepCopy: boolean;
  onKeepCopyChange: (keep: boolean) => void;
  onChange: (image: Blob | null) => void;
}) {
  const [picked, setPicked] = useState<File | null>(null);
  /** The player chose not to share the device copy this time. */
  const [skipSaved, setSkipSaved] = useState(false);
  const candidate: Blob | null = picked ?? (!skipSaved && deviceCopy ? deviceCopy : null);
  const [check, setCheck] = useState<{ of: Blob; result: ImageInspection } | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const result = check && check.of === candidate ? check.result : null;

  useEffect(() => {
    if (!candidate) return;
    let cancelled = false;
    void checkProfileFile(candidate).then(
      (outcome) => !cancelled && setCheck({ of: candidate, result: outcome }),
    );
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  useEffect(() => {
    onChange(candidate && result?.ok ? candidate : null);
  }, [candidate, result, onChange]);

  useEffect(() => {
    if (!candidate || !result?.ok) {
      setThumb(null);
      return;
    }
    const url = URL.createObjectURL(candidate);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [candidate, result]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPicked(file);
  }

  function handleKeepCopy(keep: boolean) {
    // Turning the copy off deletes it — but not the choice to share it now.
    if (!keep && !picked && candidate) {
      setPicked(new File([candidate], 'Your saved image', { type: candidate.type }));
    }
    onKeepCopyChange(keep);
  }

  const fileInput = (
    <input
      type="file"
      accept={PROFILE_IMAGE_ACCEPT}
      onChange={handleFile}
      aria-label="Choose a profile image"
    />
  );

  return (
    <div className="join-field">
      <span className="join-label">
        Your profile <span className="join-optional">optional</span>
      </span>
      {candidate ? (
        <div className={`join-profile${result && !result.ok ? ' invalid' : ''}`}>
          <span className="join-profile-thumb">
            {thumb ? <img src={thumb} alt="" /> : <SheetIcon />}
          </span>
          <span className="join-profile-meta">
            <strong>{picked ? picked.name : 'Saved on this device'}</strong>
            {!result ? (
              <span>Checking…</span>
            ) : result.ok ? (
              <span>
                {PROFILE_IMAGE_FORMATS[result.type].label} · {result.width} × {result.height} ·{' '}
                {formatBytes(candidate.size)}
              </span>
            ) : (
              <span className="join-profile-error" role="alert">
                {result.error}
              </span>
            )}
          </span>
          <span className="join-profile-actions">
            <label className="join-profile-button">
              Change
              {fileInput}
            </label>
            <button
              type="button"
              className="join-profile-button"
              onClick={() => {
                setPicked(null);
                setSkipSaved(true);
              }}
            >
              {picked ? 'Remove' : 'Don’t share'}
            </button>
          </span>
        </div>
      ) : (
        <div className="join-profile-empty">
          <label className="join-profile-add">
            <SheetIcon />
            <span>
              Add an image
              <small>your character sheet, say · PNG, JPG or WebP, up to 10 MB</small>
            </span>
            {fileInput}
          </label>
          {deviceCopy && (
            <button type="button" className="link-button" onClick={() => setSkipSaved(false)}>
              Use your saved one
            </button>
          )}
        </div>
      )}
      <span className="join-profile-note">
        Only you and the host will see it.
        <label className="join-profile-keep">
          <input
            type="checkbox"
            checked={keepCopy}
            onChange={(event) => handleKeepCopy(event.target.checked)}
          />
          Keep a copy on this device
        </label>
      </span>
    </div>
  );
}
