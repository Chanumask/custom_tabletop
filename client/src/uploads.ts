import { SERVER_URL } from './socket.js';

/**
 * Uploads a file to the given REST route (see server/src/uploads.ts) and
 * returns an *absolute* URL to it. The server only returns a path relative
 * to itself (e.g. `/uploads/images/<id>.png`) — this prefixes it with
 * `SERVER_URL` so the resulting URL is resolvable by every client
 * regardless of which origin they're being served from (the map
 * background/sound URL ends up in shared `GameState`, read by clients that
 * aren't the uploader), the same requirement `DEFAULT_SPAWN_POSITION`-style
 * shared constants solve for other cross-client assumptions.
 */
async function postFile(path: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${SERVER_URL}${path}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Upload failed (${response.status}).`);
  }

  const result = (await response.json()) as { url: string };
  return `${SERVER_URL}${result.url}`;
}

export function uploadImage(file: File): Promise<string> {
  return postFile('/uploads/images', file);
}

export function uploadSound(file: File): Promise<string> {
  return postFile('/uploads/sounds', file);
}

/** An upload as this client can load it: the server keeps pinned photos by
 * path alone (`/uploads/images/<name>`, docs/decisions.md "Gadgets
 * review"), so those get `SERVER_URL` in front; a full URL (anything saved
 * before that) is used as it is. */
export function resolveUploadUrl(url: string): string {
  return url.startsWith('/') ? `${SERVER_URL}${url}` : url;
}
