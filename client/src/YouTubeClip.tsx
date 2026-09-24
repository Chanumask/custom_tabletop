import { useEffect, useRef } from 'react';
import {
  YT_ENDED,
  describeYouTubeError,
  loadYouTubeApi,
  type YouTubePlayer,
} from './youtubeApi.js';

export interface ActiveClip {
  /** Changes every time a clip is (re)triggered, so the same clip played
   * twice restarts instead of being ignored as "already showing". */
  key: number;
  videoId: string;
  startSeconds: number;
  title: string;
  playedBy: string;
}

// YouTube requires an embedded player to be reasonably sized and visible;
// 16:9 at 200px tall is the smallest honest size.
const PLAYER_WIDTH = 356;
const PLAYER_HEIGHT = 200;

/**
 * The soundboard's YouTube "clip" player: when anyone plays a YouTube entry,
 * every client shows this small card with YouTube's own embedded player —
 * visible, with YouTube's branding and controls intact, never audio-only or
 * hidden (YouTube's developer policies; docs/decisions.md). Closes itself
 * when the video ends, on error (with a toast explaining why), or via ×.
 */
export function YouTubeClip({
  clip,
  volume,
  onClose,
  onError,
}: {
  clip: ActiveClip;
  volume: number;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const volumeRef = useRef(volume);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  onCloseRef.current = onClose;
  onErrorRef.current = onError;

  useEffect(() => {
    volumeRef.current = volume;
    playerRef.current?.setVolume(Math.round(volume * 100));
  }, [volume]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    // The API replaces the element it's given with an iframe — hand it a
    // throwaway child so React's own node is never swapped out underneath it.
    const mount = document.createElement('div');
    host.appendChild(mount);
    let cancelled = false;

    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) {
          return;
        }
        playerRef.current = new YT.Player(mount, {
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
          videoId: clip.videoId,
          playerVars: {
            autoplay: 1,
            start: clip.startSeconds,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(Math.round(volumeRef.current * 100));
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === YT_ENDED) {
                onCloseRef.current();
              }
            },
            onError: (event) => {
              onErrorRef.current(describeYouTubeError(event.data));
              onCloseRef.current();
            },
          },
        });
      },
      () => {
        if (!cancelled) {
          onErrorRef.current('Could not load the YouTube player.');
          onCloseRef.current();
        }
      },
    );

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, [clip.key, clip.videoId, clip.startSeconds]);

  return (
    <div className="youtube-clip" role="region" aria-label="YouTube clip">
      <div className="youtube-clip-header">
        <span className="youtube-clip-title" title={clip.title}>
          ▶ {clip.title}
        </span>
        <span className="youtube-clip-by">played by {clip.playedBy}</span>
        <button type="button" className="youtube-clip-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div ref={hostRef} className="youtube-clip-player" />
    </div>
  );
}
