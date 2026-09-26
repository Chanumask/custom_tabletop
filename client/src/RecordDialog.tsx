import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  RECORDS,
  SOUND_RECORD_PREFIX,
  type RecordPlaying,
  type SoundState,
} from '@custom-tabletop/shared';
import { playableSounds } from './music/MusicPlayer.js';
import { useSettings } from './useSettings.js';

/** Each record's sleeve color (RecordPlayer.ts labels match). */
const SLEEVE: Record<string, string> = {
  tavern: '#9a3a20',
  lofi: '#6d5a98',
  'rain-jazz': '#27507a',
};

/**
 * The record box (RecordPlayer.ts): pick a record to put on — the record
 * player's own three, or a sound from the soundboard — or take it off. The
 * music is everyone's; how loud it is, is each player's own (their "Music"
 * sound, the same setting as in Settings).
 */
export function RecordDialog({
  playing,
  soundboard,
  canUseSounds,
  onPlay,
  onStop,
  onClose,
}: {
  playing: RecordPlaying | null;
  soundboard: readonly SoundState[];
  canUseSounds: boolean;
  onPlay: (record: string) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const { settings, updateSettings } = useSettings();
  const music = settings.sound.music;
  const setMusic = (change: Partial<typeof music>) =>
    updateSettings({ sound: { ...settings.sound, music: { ...music, ...change } } });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sounds = playableSounds(soundboard);
  const record = (id: string, name: string, hint: string, color: string) => {
    const on = playing?.record === id;
    return (
      <li key={id}>
        <button
          type="button"
          className={on ? 'record-choice playing' : 'record-choice'}
          aria-pressed={on}
          disabled={!canUseSounds}
          onClick={() => (on ? onStop() : onPlay(id))}
        >
          <span className="record-disc" style={{ '--label': color } as CSSProperties} aria-hidden />
          <span className="record-text">
            <span>{name}</span>
            <small>{on ? 'Playing — click to take it off' : hint}</small>
          </span>
        </button>
      </li>
    );
  };

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="The record player">
      <div className="record-dialog">
        <p className="modal-title">The record player</p>
        {!canUseSounds && <p className="settings-hint">The host has turned sounds off for now.</p>}
        <ul className="record-list" aria-label="Records">
          {RECORDS.map(({ id, name, hint }) => record(id, name, hint, SLEEVE[id]!))}
        </ul>
        {sounds.length > 0 && (
          <>
            <p className="host-section">From the soundboard</p>
            <ul className="record-list" aria-label="Sounds from the soundboard">
              {sounds.map((sound) =>
                record(
                  `${SOUND_RECORD_PREFIX}${sound.id}`,
                  sound.name,
                  'plays on a loop',
                  '#c49a2c',
                ),
              )}
            </ul>
          </>
        )}
        <label className={music.on ? 'sound-mix-row' : 'sound-mix-row off'}>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={music.on}
            aria-label="Music"
            onChange={(event) => setMusic({ on: event.target.checked })}
          />
          <span className="sound-mix-label">
            <span>Music volume</span>
            <small>Just for you</small>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(music.volume * 100)}
            disabled={!music.on}
            aria-label="Music volume"
            onChange={(event) => setMusic({ volume: Number(event.target.value) / 100 })}
          />
        </label>
        <div className="modal-actions">
          {playing && canUseSounds && (
            <button type="button" onClick={onStop}>
              Take the record off
            </button>
          )}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
