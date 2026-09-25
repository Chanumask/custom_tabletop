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
const CARD_WIDTH = 356;
const CARD_HEIGHT = 200;

/** Where the last clip was when its player went away — moving a clip
 * between the TV and the corner card remounts the player, and it should
 * carry on from there rather than start over. */
let resumePoint: { key: number; seconds: number } | null = null;

/**
 * YouTube's own embedded player for a clip, at a given size — visible, with
 * YouTube's branding and controls intact, never audio-only or hidden
 * (YouTube's developer policies; docs/decisions.md). Used on the room's TV
 * (TvScreen.ts) and in the corner card below. Calls `onEnded` when the
 * video finishes, `onError` (with a readable reason) if it can't play.
 */
export function YouTubeEmbed({
  clip,
  volume,
  width,
  height,
  onEnded,
  onError,
}: {
  clip: ActiveClip;
  volume: number;
  width: number;
  height: number;
  onEnded: () => void;
  onError: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const volumeRef = useRef(volume);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  onEndedRef.current = onEnded;
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
    const start =
      resumePoint?.key === clip.key ? Math.floor(resumePoint.seconds) : clip.startSeconds;

    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) {
          return;
        }
        playerRef.current = new YT.Player(mount, {
          width,
          height,
          videoId: clip.videoId,
          playerVars: {
            autoplay: 1,
            start,
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
                onEndedRef.current();
              }
            },
            onError: (event) => {
              onErrorRef.current(describeYouTubeError(event.data));
              onEndedRef.current();
            },
          },
        });
      },
      () => {
        if (!cancelled) {
          onErrorRef.current('Could not load the YouTube player.');
          onEndedRef.current();
        }
      },
    );

    return () => {
      cancelled = true;
      try {
        const seconds = playerRef.current?.getCurrentTime() ?? 0;
        if (seconds > 0) {
          resumePoint = { key: clip.key, seconds };
        }
      } catch {
        // Not ready yet: nothing to resume from.
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, [clip.key, clip.videoId, clip.startSeconds, width, height]);

  return <div ref={hostRef} className="youtube-embed" style={{ width, height }} />;
}

/**
 * The corner card version: YouTube's player with the clip's title, who
 * played it, and ×. Shown when the room has no TV, or when a player pops
 * the clip out of the TV (`onShowOnTv` offers the way back).
 */
export function YouTubeClip({
  clip,
  volume,
  onClose,
  onError,
  onShowOnTv,
}: {
  clip: ActiveClip;
  volume: number;
  onClose: () => void;
  onError: (message: string) => void;
  onShowOnTv?: () => void;
}) {
  return (
    <div className="youtube-clip" role="region" aria-label="YouTube clip">
      <div className="youtube-clip-header">
        <span className="youtube-clip-title" title={clip.title}>
          ▶ {clip.title}
        </span>
        <span className="youtube-clip-by">played by {clip.playedBy}</span>
        {onShowOnTv && (
          <button type="button" className="youtube-clip-tv" onClick={onShowOnTv}>
            On the TV
          </button>
        )}
        <button type="button" className="youtube-clip-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <YouTubeEmbed
        clip={clip}
        volume={volume}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        onEnded={onClose}
        onError={onError}
      />
    </div>
  );
}
