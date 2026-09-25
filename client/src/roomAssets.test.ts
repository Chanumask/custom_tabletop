import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onRoomLoadProgress,
  preloadRoom,
  resetRoomPreloadForTests,
  roomLoadProgress,
} from './roomAssets.js';

function streamingResponse(chunks: number[][], announced: number | null): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(new Uint8Array(chunk)));
      controller.close();
    },
  });
  const headers = new Headers();
  if (announced !== null) headers.set('content-length', String(announced));
  return new Response(stream, { status: 200, headers });
}

afterEach(() => resetRoomPreloadForTests());

describe('preloadRoom', () => {
  it('downloads once, reporting progress, and shares the bytes', async () => {
    const fetchMock = vi.fn(async () =>
      streamingResponse(
        [
          [1, 2],
          [3, 4, 5],
        ],
        5,
      ),
    );
    const seen: number[] = [];
    const off = onRoomLoadProgress((fraction) => seen.push(fraction));

    const [a, b] = await Promise.all([preloadRoom(fetchMock), preloadRoom(fetchMock)]);
    off();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect([...new Uint8Array(a)]).toEqual([1, 2, 3, 4, 5]);
    expect(seen.at(-1)).toBe(1);
    expect(seen[0]).toBeCloseTo(0.4);
    expect(roomLoadProgress()).toBe(1);
  });

  it('copes with a server that sends more than it announced', async () => {
    const fetchMock = vi.fn(async () =>
      streamingResponse(
        [
          [1, 2, 3],
          [4, 5, 6, 7],
        ],
        4,
      ),
    );
    const bytes = await preloadRoom(fetchMock);
    expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('retries after a failed download', async () => {
    const failing = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(preloadRoom(failing)).rejects.toThrow('503');
    const working = vi.fn(async () => streamingResponse([[9]], 1));
    expect([...new Uint8Array(await preloadRoom(working))]).toEqual([9]);
  });
});
