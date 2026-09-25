import { useEffect, useState } from 'react';
import { onRoomLoadProgress, roomLoadProgress } from './roomAssets.js';
import { BrandMark } from './JoinForm.js';

/**
 * "Setting up the table…" — shown over the room while its model (and the
 * game view's code) is still arriving: a real percentage where the server
 * tells us the size, instead of a black screen. Usually gone in a blink,
 * since the join screen already started the download.
 */
export function RoomLoading() {
  const [progress, setProgress] = useState(roomLoadProgress);
  useEffect(() => onRoomLoadProgress(setProgress), []);
  const percent = Math.round(progress * 100);
  return (
    <div className="room-loading" role="status" aria-live="polite">
      <BrandMark />
      <p className="room-loading-title">Setting up the table…</p>
      <div className="room-loading-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(percent, 4)}%` }} />
      </div>
      <p className="room-loading-detail">{percent > 0 ? `${percent}%` : 'Lighting the fire'}</p>
    </div>
  );
}
