import { parseYouTubeUrl, type SoundState } from '@custom-tabletop/shared';

export type SoundKind = 'tone' | 'file' | 'link' | 'youtube';

/** What kind of soundboard entry this is — for labels in the UI. A file is
 * anything served from this app's own upload folder (`/uploads/sounds/`). */
export function soundKind(entry: Pick<SoundState, 'url'>): SoundKind {
  if (!entry.url) {
    return 'tone';
  }
  if (parseYouTubeUrl(entry.url)) {
    return 'youtube';
  }
  try {
    return new URL(entry.url).pathname.startsWith('/uploads/sounds/') ? 'file' : 'link';
  } catch {
    return 'link';
  }
}

export const SOUND_KIND_LABEL: Record<SoundKind, string> = {
  tone: 'Tone',
  file: 'File',
  link: 'Link',
  youtube: 'YouTube',
};
