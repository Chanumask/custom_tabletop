import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer, type AppServerOptions } from './server.js';
import { SessionStore } from './sessionStore.js';

// Deployment behaviors (docs/engineering/deployment.md): the server serves
// the built client itself, and uploads are capped and rate-limited.

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function pngForm(): FormData {
  const form = new FormData();
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'map.png');
  return form;
}

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabletop-deploy-'));
  tempDirs.push(dir);
  return dir;
}

let running: AppServer | null = null;

async function start(options: AppServerOptions): Promise<string> {
  running = createAppServer({ uploadsDir: tempDir(), ...options });
  await new Promise<void>((resolve) => running!.http.listen(0, () => resolve()));
  const address = running.http.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://localhost:${address.port}`;
}

afterEach(async () => {
  if (running) {
    running.io.close();
    await new Promise<void>((resolve) => running!.http.close(() => resolve()));
    running = null;
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('serving the built client', () => {
  function fakeDist(): string {
    const dist = tempDir();
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Tabletop</title>');
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
    fs.mkdirSync(path.join(dist, 'models'));
    fs.writeFileSync(path.join(dist, 'models', 'room.glb'), 'glb');
    return dist;
  }

  it('serves the app at / and never caches it, so a redeploy shows on reload', async () => {
    const url = await start({ clientDist: fakeDist() });
    const page = await fetch(`${url}/?join=ABCDE`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Tabletop</title>');
    expect(page.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed assets for a year and revalidates everything else', async () => {
    const url = await start({ clientDist: fakeDist() });
    const asset = await fetch(`${url}/assets/index-abc123.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const model = await fetch(`${url}/models/room.glb`);
    expect(model.status).toBe(200);
    expect(model.headers.get('cache-control')).toBe('no-cache');
  });

  it('falls back to the app for other paths, but not for the API', async () => {
    const url = await start({ clientDist: fakeDist() });
    expect(await (await fetch(`${url}/some/page`)).text()).toContain('Tabletop');
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: 'ok' });
    expect((await fetch(`${url}/uploads/images/missing.png`)).status).toBe(404);
  });

  it('serves no client at all when none is configured (dev: Vite does)', async () => {
    const url = await start({});
    expect((await fetch(`${url}/`)).status).toBe(404);
  });
});

describe('upload limits', () => {
  it('refuses uploads once storage is full of files still in use', async () => {
    const uploadsDir = tempDir();
    fs.mkdirSync(path.join(uploadsDir, 'images'));
    fs.writeFileSync(path.join(uploadsDir, 'images', 'fresh.png'), Buffer.alloc(64));
    const url = await start({
      uploadsDir,
      // Tiny cap; the file is too fresh to prune (minAge), so it stays.
      uploadPolicy: { maxBytes: 32, maxAgeMs: 60_000, minAgeMs: 60_000 },
    });
    const response = await fetch(`${url}/uploads/images`, { method: 'POST', body: pngForm() });
    expect(response.status).toBe(507);
    expect(((await response.json()) as { error: string }).error).toMatch(/storage is full/);
  });

  it('frees space by pruning stale unused files instead of refusing', async () => {
    const uploadsDir = tempDir();
    fs.mkdirSync(path.join(uploadsDir, 'images'));
    const stale = path.join(uploadsDir, 'images', 'stale.png');
    fs.writeFileSync(stale, Buffer.alloc(64));
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(stale, longAgo, longAgo);
    const url = await start({
      uploadsDir,
      uploadPolicy: { maxBytes: 32, maxAgeMs: 60 * 60 * 1000, minAgeMs: 60_000 },
    });
    const response = await fetch(`${url}/uploads/images`, { method: 'POST', body: pngForm() });
    expect(response.status).toBe(200);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('rate-limits uploads per client', async () => {
    const url = await start({ uploadRateLimit: { limit: 2, windowMs: 60_000 } });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push(
        (await fetch(`${url}/uploads/images`, { method: 'POST', body: pngForm() })).status,
      );
    }
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('SessionStore.referencedUploads', () => {
  it('lists the uploads live sessions use: maps and soundboard sounds, not other links', () => {
    const store = new SessionStore();
    store.join('ROOM1', 'p1', 'Alice');
    store.updateScene('ROOM1', 'p1', 'default', {
      backgroundImage: 'https://tabletop.murri.me/uploads/images/map-1.png',
    });
    store.addSound('ROOM1', 's1', 'Horn', 'https://tabletop.murri.me/uploads/sounds/horn.mp3');
    store.addSound('ROOM1', 's2', 'Elsewhere', 'https://example.com/sound.mp3');
    expect([...store.referencedUploads()].sort()).toEqual(['horn.mp3', 'map-1.png']);
  });
});
