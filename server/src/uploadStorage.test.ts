import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RateLimiter,
  planPrune,
  pruneUploads,
  uploadNameFromUrl,
  type StoragePolicy,
  type StoredUpload,
} from './uploadStorage.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = 1_000_000_000_000;

const policy: StoragePolicy = { maxBytes: 100, maxAgeMs: 24 * HOUR, minAgeMs: 10 * MINUTE };

function file(name: string, size: number, ageMs: number): StoredUpload {
  return { name, path: `/x/${name}`, size, mtimeMs: NOW - ageMs };
}

const names = (files: StoredUpload[]) => files.map((f) => f.name).sort();

describe('planPrune', () => {
  it('deletes unused files older than the max age, keeps the rest', () => {
    const plan = planPrune(
      [file('old.png', 10, 25 * HOUR), file('recent.png', 10, 2 * HOUR)],
      policy,
      new Set(),
      NOW,
    );
    expect(names(plan.remove)).toEqual(['old.png']);
    expect(plan.keptBytes).toBe(10);
  });

  it('never deletes a file a live session uses, however old', () => {
    const plan = planPrune([file('map.png', 10, 90 * HOUR)], policy, new Set(['map.png']), NOW);
    expect(plan.remove).toEqual([]);
  });

  it('evicts the oldest unused files first while over the cap', () => {
    const plan = planPrune(
      [
        file('a.png', 40, 5 * HOUR),
        file('b.png', 40, 4 * HOUR),
        file('c.png', 40, 3 * HOUR),
        file('d.png', 40, 2 * HOUR),
      ],
      policy,
      new Set(),
      NOW,
    );
    // 160 bytes, cap 100: the two oldest go.
    expect(names(plan.remove)).toEqual(['a.png', 'b.png']);
    expect(plan.keptBytes).toBe(80);
  });

  it('leaves files younger than the grace period alone, even over the cap', () => {
    const plan = planPrune(
      [file('fresh.png', 150, 2 * MINUTE), file('used.png', 50, 5 * HOUR)],
      policy,
      new Set(['used.png']),
      NOW,
    );
    expect(plan.remove).toEqual([]);
    expect(plan.keptBytes).toBe(200); // over the cap: new uploads get refused
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    const limiter = new RateLimiter(2, MINUTE);
    expect(limiter.allow('a', NOW)).toBe(true);
    expect(limiter.allow('a', NOW + 1)).toBe(true);
    expect(limiter.allow('a', NOW + 2)).toBe(false);
    expect(limiter.allow('b', NOW + 2)).toBe(true);
  });

  it('slides: old hits stop counting', () => {
    const limiter = new RateLimiter(1, MINUTE);
    expect(limiter.allow('a', NOW)).toBe(true);
    expect(limiter.allow('a', NOW + MINUTE - 1)).toBe(false);
    expect(limiter.allow('a', NOW + MINUTE)).toBe(true);
  });
});

describe('uploadNameFromUrl', () => {
  it('finds our upload file names in absolute or relative URLs', () => {
    expect(uploadNameFromUrl('https://tabletop.murri.me/uploads/images/abc.png')).toBe('abc.png');
    expect(uploadNameFromUrl('/uploads/sounds/x.mp3?v=2')).toBe('x.mp3');
    expect(uploadNameFromUrl('https://example.com/map.png')).toBeNull();
    expect(uploadNameFromUrl('')).toBeNull();
  });
});

describe('pruneUploads (on disk)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
    fs.mkdirSync(path.join(root, 'images'));
    fs.mkdirSync(path.join(root, 'sounds'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(sub: string, name: string, bytes: number, ageMs: number) {
    const target = path.join(root, sub, name);
    fs.writeFileSync(target, Buffer.alloc(bytes));
    const at = new Date(NOW - ageMs);
    fs.utimesSync(target, at, at);
  }

  it('deletes stale unused files from every subfolder and reports what stays', () => {
    write('images', 'stale.png', 30, 30 * HOUR);
    write('sounds', 'stale.mp3', 30, 30 * HOUR);
    write('images', 'kept.png', 30, 30 * HOUR);
    const kept = pruneUploads(root, policy, new Set(['kept.png']), NOW);
    expect(kept).toBe(30);
    expect(fs.readdirSync(path.join(root, 'images'))).toEqual(['kept.png']);
    expect(fs.readdirSync(path.join(root, 'sounds'))).toEqual([]);
  });
});
