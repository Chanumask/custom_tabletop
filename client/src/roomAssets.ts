/**
 * The room model's bytes, fetched once and shared: the join screen starts
 * downloading them in the background (while the player picks a name and a
 * character), so by the time they join the room is usually already here.
 * Progress is published for the "setting up the table" overlay.
 */
export const ROOM_GLTF_URL = '/models/room.glb';

let pending: Promise<ArrayBuffer> | null = null;
let progress = 0;
const listeners = new Set<(fraction: number) => void>();

function report(fraction: number): void {
  progress = fraction;
  listeners.forEach((listener) => listener(fraction));
}

/** How much of the room has arrived, 0..1 (1 once it's all here). */
export function roomLoadProgress(): number {
  return progress;
}

/** Subscribes to download progress; returns the unsubscribe function. */
export function onRoomLoadProgress(listener: (fraction: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts (or joins) the room download. Safe to call as often as you like. */
export function preloadRoom(fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  pending ??= download(fetchImpl).catch((error: unknown) => {
    pending = null; // let a later attempt retry
    report(0);
    throw error;
  });
  return pending;
}

async function download(fetchImpl: typeof fetch): Promise<ArrayBuffer> {
  const response = await fetchImpl(ROOM_GLTF_URL);
  if (!response.ok) {
    throw new Error(`Loading the room failed (${response.status}).`);
  }
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    report(1);
    return buffer;
  }
  // Without a length (or when a server sends more than it announced)
  // progress just can't be exact — it still finishes at 1.
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) report(Math.min(received / total, 0.99));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  report(1);
  return bytes.buffer;
}

/** For tests: forget the cached download. */
export function resetRoomPreloadForTests(): void {
  pending = null;
  progress = 0;
}
