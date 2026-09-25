import { useEffect, useRef } from 'react';
import type { ClipAction, SharedClip } from '@custom-tabletop/shared';
import { isSeekJump, needsResync, sharedPosition, type PollSample } from './clipSync.js';
import {
  YT_BUFFERING,
  YT_ENDED,
  YT_PAUSED,
  YT_PLAYING,
  describeYouTubeError,
  loadYouTubeApi,
  type YouTubePlayer,
} from './youtubeApi.js';

// YouTube requires an embedded player to be reasonably sized and visible;
// 16:9 at 200px tall is the smallest honest size.
const CARD_WIDTH = 356;
const CARD_HEIGHT = 200;

/** After applying the shared state, the player's own state-change events
 * for a moment are our doing, not the viewer's. */
const SELF_CHANGE_MS = 1200;
const POLL_MS = 1000;

/** What every view of the shared clip needs (App -> RoomView -> here). */
export interface ClipView {
  clip: SharedClip;
  /** serverClock - localClock (ms), from the join ack. */
  serverOffset: number;
  volume: number;
  /** False while the host has locked it and this player isn't the host. */
  canControl: boolean;
  isHost: boolean;
  locked: boolean;
  onControl: (action: ClipAction, position: number) => void;
  onLock: (locked: boolean) => void;
  onError: (message: string) => void;
}

/**
 * YouTube's own embedded player, following the shared clip (docs/decisions.md,
 * "Synced clips") — visible, with YouTube's branding and controls intact,
 * never audio-only (YouTube's developer policies). Everyone's player tracks
 * the server's playback anchor; pausing, playing or seeking in YouTube's own
 * controls is sent to everyone (or undone, if the host has locked it).
 */
export function YouTubeEmbed({
  view,
  width,
  height,
}: {
  view: ClipView;
  width: number;
  height: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const selfChangeUntil = useRef(0);
  const lastPoll = useRef<PollSample | null>(null);
  const { clip } = view;

  /** Bring the local player to where everyone is. */
  const applyShared = () => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const target = sharedPosition(viewRef.current);
    selfChangeUntil.current = Date.now() + SELF_CHANGE_MS;
    if (needsResync(player.getCurrentTime(), target)) {
      player.seekTo(target, true);
      // Our own jump: the new baseline, not something to report.
      lastPoll.current = { position: target, at: Date.now() };
    }
    if (viewRef.current.clip.playing) player.playVideo();
    else player.pauseVideo();
  };

  /** The viewer did something in YouTube's controls: share it, or undo it. */
  const viewerDid = (action: ClipAction) => {
    const player = playerRef.current;
    if (!player) return;
    if (viewRef.current.canControl || action === 'ended') {
      selfChangeUntil.current = Date.now() + SELF_CHANGE_MS;
      viewRef.current.onControl(action, player.getCurrentTime());
    } else {
      applyShared();
    }
  };

  useEffect(() => {
    playerRef.current?.setVolume(Math.round(view.volume * 100));
  }, [view.volume]);

  // A new clip (or size): a fresh player, starting where everyone is.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The API replaces the element it's given with an iframe — hand it a
    // throwaway child so React's own node is never swapped out underneath it.
    const mount = document.createElement('div');
    host.appendChild(mount);
    let cancelled = false;
    readyRef.current = false;

    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) return;
        const start = Math.floor(sharedPosition(viewRef.current));
        playerRef.current = new YT.Player(mount, {
          width,
          height,
          videoId: viewRef.current.clip.videoId,
          playerVars: {
            autoplay: viewRef.current.clip.playing ? 1 : 0,
            start,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              readyRef.current = true;
              event.target.setVolume(Math.round(viewRef.current.volume * 100));
              applyShared();
            },
            onStateChange: (event) => {
              if (event.data === YT_ENDED) {
                viewerDid('ended');
                return;
              }
              if (Date.now() < selfChangeUntil.current) return;
              const shared = viewRef.current.clip;
              if (event.data === YT_PLAYING && !shared.playing) viewerDid('play');
              if (event.data === YT_PAUSED && shared.playing) viewerDid('pause');
            },
            onError: (event) => viewRef.current.onError(describeYouTubeError(event.data)),
          },
        });
        // Dev-only automation hook (like RoomView's __tabletop): lets live
        // checks read and drive the player the way YouTube's own controls
        // would. Compiled out of production builds.
        if (import.meta.env.DEV) {
          (window as unknown as { __clip?: unknown }).__clip = {
            time: () => playerRef.current?.getCurrentTime() ?? null,
            state: () => playerRef.current?.getPlayerState() ?? null,
            seek: (seconds: number) => playerRef.current?.seekTo(seconds, true),
            pause: () => playerRef.current?.pauseVideo(),
          };
        }
      },
      () => {
        if (!cancelled) viewRef.current.onError('Could not load the YouTube player.');
      },
    );

    // Now and then: spot a seek in YouTube's controls, or catch up after
    // buffering left this player behind.
    const poll = setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      const now = Date.now();
      const previous = lastPoll.current;
      if (player.getPlayerState() === YT_BUFFERING) {
        // Keep the reading from before the buffering, only moving its clock:
        // buffering then can't look like a jump, but a seek (which buffers
        // too) still does once playback settles.
        if (previous) lastPoll.current = { ...previous, at: now };
        return;
      }
      // Always keep tracking — even while our own change settles — so a
      // viewer's seek right after one still has a "before" to jump from.
      const sample = { position: player.getCurrentTime(), at: now };
      lastPoll.current = sample;
      if (now < selfChangeUntil.current || !previous) return;
      if (isSeekJump(previous, sample, viewRef.current.clip.playing)) {
        viewerDid('seek');
      } else if (needsResync(sample.position, sharedPosition(viewRef.current))) {
        applyShared();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
    // applyShared/viewerDid read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.videoId, width, height]);

  // Someone paused, played or seeked: follow.
  useEffect(() => {
    applyShared();
  }, [clip.playing, clip.position, clip.anchorAt]);

  return <div ref={hostRef} className="youtube-embed" style={{ width, height }} />;
}

/** Play/pause for everyone, the host's lock, and stop — shared by the TV
 * banner and the corner card. */
export function ClipControls({ view }: { view: ClipView }) {
  const { clip, canControl, isHost, locked } = view;
  return (
    <>
      {canControl && (
        <button
          type="button"
          className="clip-control"
          aria-label={clip.playing ? 'Pause for everyone' : 'Play for everyone'}
          title={clip.playing ? 'Pause for everyone' : 'Play for everyone'}
          onClick={() => view.onControl(clip.playing ? 'pause' : 'play', sharedPosition(view))}
        >
          {clip.playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14M16 5v14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          )}
        </button>
      )}
      {isHost ? (
        <button
          type="button"
          className={`clip-control${locked ? ' active' : ''}`}
          aria-pressed={locked}
          title={
            locked
              ? 'Only you control the TV — click to let everyone'
              : 'Let only you control the TV'
          }
          aria-label={locked ? 'Unlock the TV for everyone' : 'Lock the TV to the host'}
          onClick={() => view.onLock(!locked)}
        >
          <LockIcon locked={locked} />
        </button>
      ) : (
        locked && (
          <span className="clip-locked" title="The host controls the TV">
            <LockIcon locked />
          </span>
        )
      )}
      {canControl && (
        <button
          type="button"
          className="youtube-clip-close"
          aria-label="Stop the clip for everyone"
          title="Stop for everyone"
          onClick={() => view.onControl('stop', sharedPosition(view))}
        >
          ×
        </button>
      )}
    </>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d={locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'} />
    </svg>
  );
}

/**
 * The corner card version: YouTube's player with the clip's title, who
 * played it, and the shared controls. Shown when the room has no TV, or
 * when a player pops the clip out of the TV (`onShowOnTv` offers the way back).
 */
export function YouTubeClip({ view, onShowOnTv }: { view: ClipView; onShowOnTv?: () => void }) {
  const { clip } = view;
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
        <ClipControls view={view} />
      </div>
      <YouTubeEmbed view={view} width={CARD_WIDTH} height={CARD_HEIGHT} />
    </div>
  );
}
