import { describe, expect, it } from 'vitest';
import { NOT_AUDIO_ERROR, resolveSoundLink, type OEmbedResult } from './soundLinks.js';

function deps(options: { playable?: boolean; oembed?: OEmbedResult } = {}) {
  const probed: string[] = [];
  const looked: string[] = [];
  return {
    probed,
    looked,
    deps: {
      probeAudio: async (url: string) => {
        probed.push(url);
        return options.playable ?? true;
      },
      lookupYouTube: async (url: string) => {
        looked.push(url);
        return options.oembed ?? { kind: 'unknown' as const };
      },
    },
  };
}

describe('resolveSoundLink', () => {
  it('rejects something that is not an http(s) link', async () => {
    const { deps: d } = deps();
    const result = await resolveSoundLink('air horn', d);
    expect(result.ok).toBe(false);
  });

  it('accepts a direct audio link that actually loads, named from the URL', async () => {
    const { deps: d, probed } = deps({ playable: true });
    const result = await resolveSoundLink(' https://example.com/sfx/air_horn.mp3 ', d);
    expect(result).toEqual({
      ok: true,
      name: 'air horn',
      url: 'https://example.com/sfx/air_horn.mp3',
    });
    expect(probed).toEqual(['https://example.com/sfx/air_horn.mp3']);
  });

  it('rejects a link that does not load as audio (e.g. a web page)', async () => {
    const { deps: d } = deps({ playable: false });
    expect(await resolveSoundLink('https://example.com/some-page', d)).toEqual({
      ok: false,
      error: NOT_AUDIO_ERROR,
    });
  });

  it('turns a YouTube link into a clip named after the video, never probing it as audio', async () => {
    const {
      deps: d,
      probed,
      looked,
    } = deps({ oembed: { kind: 'ok', title: 'Dramatic Chipmunk' } });
    const result = await resolveSoundLink('https://youtu.be/a1Y73sPHKxw?t=3', d);
    expect(result).toEqual({
      ok: true,
      name: 'Dramatic Chipmunk',
      url: 'https://www.youtube.com/watch?v=a1Y73sPHKxw&t=3',
    });
    expect(probed).toEqual([]);
    expect(looked).toEqual(['https://www.youtube.com/watch?v=a1Y73sPHKxw&t=3']);
  });

  it('refuses a YouTube video whose owner disabled embedding', async () => {
    const { deps: d } = deps({ oembed: { kind: 'not-embeddable' } });
    const result = await resolveSoundLink('https://www.youtube.com/watch?v=a1Y73sPHKxw', d);
    expect(result.ok).toBe(false);
  });

  it('refuses a YouTube video that does not exist', async () => {
    const { deps: d } = deps({ oembed: { kind: 'not-found' } });
    const result = await resolveSoundLink('https://www.youtube.com/watch?v=a1Y73sPHKxw', d);
    expect(result).toEqual({ ok: false, error: 'That YouTube video doesn’t exist or is private.' });
  });

  it('still accepts a YouTube link when the title lookup itself is unavailable', async () => {
    const { deps: d } = deps({ oembed: { kind: 'unknown' } });
    const result = await resolveSoundLink('https://www.youtube.com/shorts/a1Y73sPHKxw', d);
    expect(result).toEqual({
      ok: true,
      name: 'YouTube clip',
      url: 'https://www.youtube.com/watch?v=a1Y73sPHKxw',
    });
  });

  it('shortens a very long title to fit a button label', async () => {
    const { deps: d } = deps({ oembed: { kind: 'ok', title: 'x'.repeat(100) } });
    const result = await resolveSoundLink('https://youtu.be/a1Y73sPHKxw', d);
    expect(result.ok && result.name).toHaveLength(40);
    expect(result.ok && result.name.endsWith('…')).toBe(true);
  });
});
