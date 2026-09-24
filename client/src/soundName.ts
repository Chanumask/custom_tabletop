/**
 * Derives a reasonable display name from a direct audio link, for the
 * "paste a link" path of adding a sound (Milestone 10 follow-up) — unlike
 * a file upload, a pasted URL has no `File.name` to fall back on
 * (`client/src/uploads.ts`). Falls back to `"Sound"` for anything
 * unparseable rather than showing an empty/broken label.
 */
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
