import {
  PROFILE_IMAGE_DAMAGED_ERROR,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TOO_BIG_ERROR,
  inspectImage,
  type ImageInspection,
  type ProfileImage,
} from '@custom-tabletop/shared';
import { SERVER_URL } from './socket.js';

/**
 * Player profiles, the client's half (docs/decisions.md, "Player
 * profiles"; the server's is server/src/profileImages.ts). Every request
 * proves who's asking with this tab's own player token, in headers — there
 * is no link to a profile image that works on its own, so images are
 * fetched here and shown from memory (object URLs).
 */
const ROUTE = '/api/profile-image';

export interface PlayerCredentials {
  sessionId: string;
  playerId: string;
  playerToken: string;
}

function authHeaders({ sessionId, playerId, playerToken }: PlayerCredentials) {
  return {
    'X-Table': encodeURIComponent(sessionId),
    'X-Player': encodeURIComponent(playerId),
    Authorization: `Bearer ${playerToken}`,
  };
}

const OFFLINE_ERROR = 'Couldn’t reach the server — check your connection and try again.';

/** What went wrong, in words, from a failed response. */
export function describeFailure(status: number, body: unknown): string {
  const error =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  if (error) return error;
  if (status === 413) return PROFILE_IMAGE_TOO_BIG_ERROR;
  if (status === 429) return 'Too many uploads — wait a few minutes and try again.';
  if (status === 0) return OFFLINE_ERROR;
  if (status >= 500) return 'The server couldn’t take it right now — try again in a moment.';
  return `That didn’t work (error ${status}) — try again.`;
}

async function failure(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  return new Error(describeFailure(response.status, body));
}

/** Whether this browser can actually show `file` — a file that passes the
 * byte checks but won't display would only show the host a broken image. */
function canDisplay(file: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const done = (ok: boolean) => {
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    image.onload = () => done(image.naturalWidth > 0);
    image.onerror = () => done(false);
    image.src = url;
  });
}

/** Checks a picked file by the server's own rules (shared/profileImage.ts)
 * before sending up to 10 MB, then that it displays. */
export async function checkProfileFile(file: Blob): Promise<ImageInspection> {
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return { ok: false, error: PROFILE_IMAGE_TOO_BIG_ERROR };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: 'Couldn’t read that file.' };
  }
  const inspection = inspectImage(bytes);
  if (!inspection.ok) return inspection;
  if (!(await canDisplay(file))) {
    return { ok: false, error: PROFILE_IMAGE_DAMAGED_ERROR };
  }
  return inspection;
}

/** Shares `file` as this player's profile image, reporting upload progress
 * (0–1). Rejects with an Error whose message says what went wrong, or an
 * AbortError if `signal` fires. */
export function uploadProfileImage(
  credentials: PlayerCredentials,
  file: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ProfileImage> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }
    // XMLHttpRequest rather than fetch: fetch can't report upload progress,
    // and 10 MB on a slow connection deserves a progress bar.
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${SERVER_URL}${ROUTE}`);
    for (const [name, value] of Object.entries(authHeaders(credentials))) {
      xhr.setRequestHeader(name, value);
    }
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      const image = (body as { profileImage?: ProfileImage } | null)?.profileImage;
      if (xhr.status === 200 && image) resolve(image);
      else reject(new Error(describeFailure(xhr.status, body)));
    };
    xhr.onerror = () => reject(new Error(OFFLINE_ERROR));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Withdraws this player's profile image. */
export async function removeProfileImage(credentials: PlayerCredentials): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${SERVER_URL}${ROUTE}`, {
      method: 'DELETE',
      headers: authHeaders(credentials),
    });
  } catch {
    throw new Error(OFFLINE_ERROR);
  }
  if (!response.ok) throw await failure(response);
}

/** A player's profile image: your own, or anyone's while you're host. */
export async function fetchProfileImage(
  credentials: PlayerCredentials,
  targetPlayerId: string,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${SERVER_URL}${ROUTE}/${encodeURIComponent(targetPlayerId)}`, {
      headers: authHeaders(credentials),
      cache: 'no-store',
    });
  } catch {
    throw new Error(OFFLINE_ERROR);
  }
  if (!response.ok) throw await failure(response);
  return response.blob();
}

// ---- Shown from memory ------------------------------------------------------

/** image id -> an object URL for it. An image never changes under its id
 * (a new upload gets a new one), so a URL stays good until released. */
const urls = new Map<string, Promise<string>>();

/** An object URL for `image` (a player's), fetched once and kept. */
export function profileImageUrl(
  credentials: PlayerCredentials,
  targetPlayerId: string,
  image: ProfileImage,
): Promise<string> {
  let url = urls.get(image.id);
  if (!url) {
    url = fetchProfileImage(credentials, targetPlayerId).then((blob) => URL.createObjectURL(blob));
    urls.set(image.id, url);
    // A failure isn't kept: the next try fetches again.
    url.catch(() => urls.delete(image.id));
  }
  return url;
}

/** Whether `imageId` can be shown without fetching it (it was uploaded
 * from this tab, or already viewed). */
export function hasProfileImageUrl(imageId: string): boolean {
  return urls.has(imageId);
}

/** Keeps a URL for an image just uploaded from this tab (no need to fetch
 * back what's already here). */
export function rememberProfileImageUrl(image: ProfileImage, file: Blob): void {
  if (!urls.has(image.id)) urls.set(image.id, Promise.resolve(URL.createObjectURL(file)));
}

/** Lets go of every image not in `keep` (replaced, withdrawn, or no longer
 * this player's to see). */
export function releaseProfileImages(keep: ReadonlySet<string>): void {
  for (const [id, url] of urls) {
    if (keep.has(id)) continue;
    urls.delete(id);
    url.then(URL.revokeObjectURL, () => {});
  }
}
