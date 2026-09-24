import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer } from './server.js';

// A minimal valid 1x1 PNG (smallest possible well-formed PNG byte sequence).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function tinyPngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(TINY_PNG_BASE64, 'base64'));
}

function fileFormData(bytes: Uint8Array, filename: string, type: string): FormData {
  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type }), filename);
  return formData;
}

describe('Upload routes (Milestone 8)', () => {
  let app: AppServer;
  let url: string;

  beforeEach(async () => {
    app = createAppServer();
    await new Promise<void>((resolve) => {
      app.http.listen(0, () => resolve());
    });
    const address = app.http.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind to a numeric port');
    }
    url = `http://localhost:${address.port}`;
  });

  afterEach(async () => {
    app.io.close();
    await new Promise<void>((resolve) => app.http.close(() => resolve()));
  });

  it('accepts a valid image upload and serves it back from the returned url', async () => {
    const response = await fetch(`${url}/uploads/images`, {
      method: 'POST',
      body: fileFormData(tinyPngBytes(), 'map.png', 'image/png'),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toMatch(/^\/uploads\/images\/.+\.png$/);

    const served = await fetch(`${url}${body.url}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('image/png');
  });

  it('rejects an image upload with a disallowed mime type', async () => {
    const response = await fetch(`${url}/uploads/images`, {
      method: 'POST',
      body: fileFormData(new TextEncoder().encode('not an image'), 'note.txt', 'text/plain'),
    });
    expect(response.status).toBe(400);
  });

  it('rejects an image upload over the size limit', async () => {
    const oversized = new Uint8Array(11 * 1024 * 1024); // over the 10MB cap
    const response = await fetch(`${url}/uploads/images`, {
      method: 'POST',
      body: fileFormData(oversized, 'huge.png', 'image/png'),
    });
    expect(response.status).toBe(400);
  });

  it('accepts a valid audio upload and serves it back from the returned url', async () => {
    const response = await fetch(`${url}/uploads/sounds`, {
      method: 'POST',
      body: fileFormData(new Uint8Array([1, 2, 3, 4]), 'clip.mp3', 'audio/mpeg'),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toMatch(/^\/uploads\/sounds\/.+\.mp3$/);

    const served = await fetch(`${url}${body.url}`);
    expect(served.status).toBe(200);
  });

  it("names the stored file by its validated type, never the client's own file name", async () => {
    // A file claiming to be a PNG but named like a web page must not be
    // stored — and so served — as .html.
    const response = await fetch(`${url}/uploads/images`, {
      method: 'POST',
      body: fileFormData(tinyPngBytes(), 'evil.html', 'image/png'),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toMatch(/\.png$/);

    const served = await fetch(`${url}${body.url}`);
    expect(served.headers.get('content-type')).toContain('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects an audio upload with a disallowed mime type', async () => {
    const response = await fetch(`${url}/uploads/sounds`, {
      method: 'POST',
      body: fileFormData(new Uint8Array([1, 2, 3]), 'note.txt', 'text/plain'),
    });
    expect(response.status).toBe(400);
  });
});
