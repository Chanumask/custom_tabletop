import { MAX_SOUND_NAME_LENGTH, isHttpUrl, parseYouTubeUrl } from '@custom-tabletop/shared';
import { deriveNameFromUrl, shortenName } from './soundName.js';

export type ResolvedSoundLink =
  { ok: true; name: string; url: string } | { ok: false; error: string };

/** What an oEmbed lookup told us about a YouTube video. */
export type OEmbedResult =
  | { kind: 'ok'; title: string }
  | { kind: 'not-embeddable' }
  | { kind: 'not-found' }
  | { kind: 'unknown' }; // network/CORS trouble — can't tell, so don't block on it

export interface SoundLinkDeps {
  /** Resolves true if the URL loads as playable audio, false if it doesn't. */
  probeAudio: (url: string) => Promise<boolean>;
  lookupYouTube: (watchUrl: string) => Promise<OEmbedResult>;
}

export const NOT_AUDIO_ERROR =
  "That link isn't a playable audio file — it has to point straight at an .mp3, .wav or .ogg file, not a web page.";

/**
 * Turns whatever a player pasted into something the soundboard can play,
 * *before* it's added — so a broken link is caught with a clear message at
 * add time instead of silently producing no sound for everyone later (the
 * original "I added a YouTube link and heard nothing" report):
 *
 * - A YouTube link becomes a clip, played through YouTube's own visible
 *   player (never extracted — docs/decisions.md). Its title comes from
 *   YouTube's oEmbed endpoint, which also reveals videos whose owners
 *   disabled embedding (those can't be played here at all).
 * - Anything else must actually load as audio in this browser.
 */
export async function resolveSoundLink(
  raw: string,
  deps: SoundLinkDeps = defaultDeps,
): Promise<ResolvedSoundLink> {
  const trimmed = raw.trim();
  if (!isHttpUrl(trimmed)) {
    return { ok: false, error: 'That doesn’t look like a link — it should start with https://' };
  }

  const clip = parseYouTubeUrl(trimmed);
  if (clip) {
    const watchUrl =
      `https://www.youtube.com/watch?v=${clip.videoId}` +
      (clip.startSeconds > 0 ? `&t=${clip.startSeconds}` : '');
    const info = await deps.lookupYouTube(watchUrl);
    switch (info.kind) {
      case 'not-embeddable':
        return {
          ok: false,
          error:
            "That video's owner doesn't allow it to be played outside YouTube, so it can't go on the soundboard.",
        };
      case 'not-found':
        return { ok: false, error: 'That YouTube video doesn’t exist or is private.' };
      case 'ok':
        return { ok: true, name: shortenName(info.title, MAX_SOUND_NAME_LENGTH), url: watchUrl };
      default:
        return { ok: true, name: 'YouTube clip', url: watchUrl };
    }
  }

  if (!(await deps.probeAudio(trimmed))) {
    return { ok: false, error: NOT_AUDIO_ERROR };
  }
  return {
    ok: true,
    name: shortenName(deriveNameFromUrl(trimmed), MAX_SOUND_NAME_LENGTH),
    url: trimmed,
  };
}

const PROBE_TIMEOUT_MS = 10_000;
const OEMBED_TIMEOUT_MS = 6_000;

function probeAudioInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const finish = (playable: boolean) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      resolve(playable);
    };
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => finish(true), { once: true });
    audio.addEventListener('error', () => finish(false), { once: true });
    audio.src = url;
  });
}

async function lookupYouTubeOEmbed(watchUrl: string): Promise<OEmbedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      { signal: controller.signal },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: 'not-embeddable' };
    }
    if (response.status === 400 || response.status === 404) {
      return { kind: 'not-found' };
    }
    if (!response.ok) {
      return { kind: 'unknown' };
    }
    const body = (await response.json()) as { title?: unknown };
    return typeof body.title === 'string' && body.title.trim()
      ? { kind: 'ok', title: body.title.trim() }
      : { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}

const defaultDeps: SoundLinkDeps = {
  probeAudio: probeAudioInBrowser,
  lookupYouTube: lookupYouTubeOEmbed,
};
