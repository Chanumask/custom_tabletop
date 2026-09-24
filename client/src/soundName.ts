/**
 * Derives a reasonable display name from a direct audio link, for the
 * "paste a link" path of adding a sound (Milestone 10 follow-up) — unlike
 * a file upload, a pasted URL has no `File.name` to fall back on
 * (`client/src/uploads.ts`). Falls back to `"Sound"` for anything
 * unparseable rather than showing an empty/broken label.
 */
/** Fits `text` into `max` characters for a label — cutting at a word
 * boundary when one is reasonably close and marking the cut with "…",
 * rather than chopping mid-word ("…Give You Up (O"). */
export function shortenName(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  let cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= max * 0.6) {
    cut = cut.slice(0, lastSpace);
  }
  return `${cut.replace(/[\s\-–—:,(]+$/, '')}…`;
}

export function deriveNameFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segment = pathname.split('/').filter(Boolean).pop();
    if (!segment) {
      return 'Sound';
    }
    const withoutExtension = segment.replace(/\.[a-zA-Z0-9]+$/, '');
    const decoded = decodeURIComponent(withoutExtension).replace(/[-_]+/g, ' ').trim();
    return decoded || 'Sound';
  } catch {
    return 'Sound';
  }
}
