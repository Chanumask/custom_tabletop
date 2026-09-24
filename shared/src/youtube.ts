/**
 * YouTube links on the soundboard are played through YouTube's own
 * *visible* embedded player — never downloaded, proxied, or played as
 * hidden/background audio, which YouTube's developer policies prohibit
 * (docs/decisions.md). This module only recognizes a YouTube link and pulls
 * out what the embedded player needs: the video id and an optional start
 * time (so a "sound" can be a specific moment, e.g. `...&t=42`).
 */

export interface YouTubeClip {
  videoId: string;
  /** Seconds into the video to start from (from `t=`/`start=`), 0 if none. */
  startSeconds: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** "90", "90s", "1m30s", "1h2m3s" -> seconds; 0 for anything unparseable. */
export function parseYouTubeTime(raw: string | null): number {
  if (!raw) {
    return 0;
  }
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!match || match[0] === '') {
    return 0;
  }
  const [, h = '0', m = '0', s = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** The clip a YouTube link points at, or null if it isn't a YouTube video
 * link at all (so it's treated as a direct audio link instead). */
export function parseYouTubeUrl(raw: string): YouTubeClip | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = url.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') {
      videoId = url.searchParams.get('v');
    } else if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') {
      videoId = second ?? null;
    }
  }

  if (!videoId || !VIDEO_ID.test(videoId)) {
    return null;
  }
  const startSeconds = parseYouTubeTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { videoId, startSeconds };
}

/** Whether `raw` is an absolute http(s) URL — the only kind of link the
 * soundboard stores (uploads are registered as absolute server URLs too). */
export function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
