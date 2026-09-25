/**
 * Minimal typing + loader for YouTube's official IFrame Player API — the
 * only way this app plays YouTube content: an embedded, *visible* player,
 * as YouTube's developer policies require (docs/decisions.md). Typed by
 * hand for just the calls used here rather than pulling in @types/youtube.
 */

export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
  data: number;
}

export interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: number;
      height: number;
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady?: (event: YouTubePlayerEvent) => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
        onError?: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
}

/** `onStateChange` / `getPlayerState` values. */
export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_BUFFERING = 3;

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YouTubeNamespace> | null = null;

/** Loads the API script once and resolves when it's ready. */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  loading ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) {
        resolve(window.YT);
      }
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the YouTube player.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** A player-facing explanation for the IFrame API's `onError` codes. */
export function describeYouTubeError(code: number): string {
  switch (code) {
    case 100:
      return 'That YouTube video was removed or is private.';
    case 101:
    case 150:
      return "That video's owner doesn't allow it to be played outside YouTube.";
    default:
      return 'YouTube couldn’t play that clip.';
  }
}
