// Providers and the merged catalog, against a fake fetch that answers like Coverr and NASA do
// (shapes from https://api.coverr.co/docs/videos/ and a real NASA collection.json). No network.

import { describe, expect, it, vi } from 'vitest';
import { pickFile, providerOf } from '@drift/core';
import { configFromEnv, createCatalog, fromCoverr, interleave, NASA_PICKS, resolveProviders, type Fetch } from './index';

const video = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Loop ${id}`,
  description: 'Waves rolling onto a beach',
  poster: `https://storage.coverr.co/p/${id}`,
  thumbnail: `https://storage.coverr.co/t/${id}`,
  is_vertical: false,
  tags: ['ocean', 'waves'],
  aspect_ratio: '16:9',
  duration: 11.625,
  max_height: 2160,
  max_width: 3840,
  urls: {
    mp4: `https://storage.coverr.co/videos/${id}?token=t`,
    mp4_preview: `https://storage.coverr.co/videos/${id}/preview?token=t`,
    mp4_download: `https://storage.coverr.co/videos/${id}/download?token=t`,
  },
  ...extra,
});

function fakeFetch(routes: Record<string, unknown | ((url: string) => unknown)>, log: string[] = []): Fetch {
  return vi.fn(async (url: string, init?: { headers?: Record<string, string>; method?: string }) => {
    log.push(`${init?.method ?? 'GET'} ${url}`);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    const body = routes[key];
    const value = typeof body === 'function' ? (body as (u: string) => unknown)(url) : body;
    if (value instanceof Error) return { ok: false, status: 429, json: async () => ({ message: value.message }) };
    return { ok: true, status: init?.method === 'PATCH' ? 204 : 200, json: async () => value };
  });
}

const list = (hits: unknown[], page = 0, pages = 3) => ({ page, pages, page_size: hits.length, total: 99, hits });

describe('config from env', () => {
  it('defaults to Coverr, NASA and Drift, and reads the app prefix', () => {
    expect(configFromEnv({}).providers).toEqual(['coverr', 'nasa', 'drift']);
    const c = configFromEnv({ VITE_WALLPAPER_PROVIDERS: ' NASA , coverr,nasa', VITE_COVERR_API_KEY: 'k' }, 'VITE_');
    expect(c.providers).toEqual(['nasa', 'coverr']);
    expect(c.coverr?.apiKey).toBe('k');
  });

  it('skips a provider that is missing its key or unknown, and always keeps Drift last', () => {
    const { providers, skipped } = resolveProviders(configFromEnv({ WALLPAPER_PROVIDERS: 'coverr,pexels,nasa' }), { fetch: fakeFetch({}) });
    expect(providers.map((p) => p.name)).toEqual(['nasa', 'drift']);
    expect(skipped).toEqual([
      { name: 'coverr', reason: 'COVERR_API_KEY is not set' },
      expect.objectContaining({ name: 'pexels' }),
    ]);
  });
});

describe('Coverr', () => {
  it('maps a video to the Wallpaper shape, free and credited', () => {
    const w = fromCoverr(video('abc'))!;
    expect(w).toMatchObject({ id: 'coverr:abc', res: '4K', resFull: '3840 × 2160', loop: '0:12', tier: 'free', publisher: 'Coverr' });
    expect(w.media).toMatchObject({ kind: 'video', preview: expect.stringContaining('/preview'), durationMs: 11625 });
    expect(w.media!.files).toEqual([{ url: expect.stringContaining('/videos/abc'), width: 3840, height: 2160, type: 'video/mp4' }]);
    expect(w.credit.provider).toBe('Coverr');
    expect(fromCoverr(video('x', { urls: {} }))).toBeNull();
  });

  it('sends the key as a Bearer token, asks for urls, and rotates category queries by page', async () => {
    const log: string[] = [];
    const fetch = fakeFetch({ '/videos?': list([video('a'), video('b')]) }, log);
    const catalog = createCatalog({ providers: ['coverr'], coverr: { apiKey: 'secret' } }, { fetch });
    await catalog.feed({ kind: 'category', category: 'Nature' }, 0);
    await catalog.feed({ kind: 'category', category: 'Nature' }, 1);
    expect((fetch as any).mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
    expect(log[0]).toContain('query=forest');
    expect(log[0]).toContain('urls=true');
    expect(log[1]).toContain('query=waterfall');
  });

  it('records a download when a Coverr wallpaper is used', async () => {
    const log: string[] = [];
    const catalog = createCatalog({ providers: ['coverr'], coverr: { apiKey: 'k' } }, { fetch: fakeFetch({ '/stats/downloads': {} }, log) });
    await catalog.used({ id: 'coverr:abc' });
    expect(log).toEqual(['PATCH https://api.coverr.co/videos/abc/stats/downloads']);
  });
});

describe('NASA', () => {
  it('serves hand-picked footage with no request, all free and credited to NASA', async () => {
    const log: string[] = [];
    const catalog = createCatalog({ providers: ['nasa'] }, { fetch: fakeFetch({}, log) });
    const page = await catalog.feed({ kind: 'category', category: 'Cosmos' });
    expect(page.items.length).toBeGreaterThan(0);
    expect(log).toEqual([]);
    for (const w of page.items) {
      expect(w.tier).toBe('free');
      expect(w.credit.license).toMatch(/Public domain/);
      expect(w.media!.files.length).toBeGreaterThan(0);
    }
  });

  it('trusts the manifest over the table for which files exist', async () => {
    const pick = NASA_PICKS[0];
    const base = `http://images-assets.nasa.gov/video/${pick.id}/${pick.id}`;
    const fetch = fakeFetch({ 'collection.json': [`${base}~orig.mp4`, `${base}~mobile.mp4`, `${base}~thumb.jpg`] });
    const w = await createCatalog({ providers: ['nasa'] }, { fetch }).get(`nasa:${pick.id}`);
    expect(w!.media!.files.map((f) => f.url.split('~')[1])).toEqual(['mobile.mp4', 'orig.mp4']);
  });
});

describe('catalog', () => {
  const coverrAndNasa = (routes: Record<string, unknown>) =>
    createCatalog({ providers: ['coverr', 'nasa', 'drift'], coverr: { apiKey: 'k' } }, { fetch: fakeFetch(routes) });

  it('interleaves providers in order without repeats', () => {
    const a = [fromCoverr(video('1'))!, fromCoverr(video('2'))!];
    const b = [fromCoverr(video('3'))!, fromCoverr(video('1'))!];
    expect(interleave([a, b]).map((w) => w.id)).toEqual(['coverr:1', 'coverr:3', 'coverr:2']);
  });

  it('shows real wallpapers, not the generated set, when a provider has some', async () => {
    const page = await coverrAndNasa({ '/videos?': list([video('a')]) }).feed({ kind: 'category', category: 'Cosmos' });
    const sources = new Set(page.items.map((w) => providerOf(w.id)));
    expect(sources).toEqual(new Set(['coverr', 'nasa']));
  });

  it('falls back to Drift’s generated wallpapers when every real provider fails', async () => {
    const onError = vi.fn();
    const catalog = createCatalog({ providers: ['coverr', 'drift'], coverr: { apiKey: 'k' } }, { fetch: fakeFetch({ '/videos?': new Error('rate limited') }), onError });
    const page = await catalog.feed({ kind: 'category', category: 'Ambient' });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((w) => providerOf(w.id) === 'drift')).toBe(true);
    expect(onError).toHaveBeenCalledWith('coverr', expect.anything());
  });

  it('does not tack generated wallpapers onto the end of a real feed', async () => {
    const catalog = coverrAndNasa({ '/videos?': (u: string) => list(u.includes('page=0') ? [video('a')] : [], 0, 1) });
    const first = await catalog.feed({ kind: 'search', query: 'zzz' }, 0);
    expect(first.items.map((w) => w.id)).toEqual(['coverr:a']);
    const second = await catalog.feed({ kind: 'search', query: 'zzz' }, 1);
    expect(second.items).toEqual([]);
  });

  it('keeps answers for the TTL, and asks again after', async () => {
    let t = 0;
    const log: string[] = [];
    const catalog = createCatalog({ providers: ['coverr'], coverr: { apiKey: 'k' } }, { fetch: fakeFetch({ '/videos?': list([video('a')]) }, log), now: () => t, ttlMs: 1000 });
    await catalog.feed({ kind: 'trending' });
    await catalog.feed({ kind: 'trending' });
    expect(log).toHaveLength(1);
    t = 2000;
    await catalog.feed({ kind: 'trending' });
    expect(log).toHaveLength(2);
  });
});

describe('pickFile', () => {
  const f = (height: number) => ({ url: `${height}`, width: 0, height, type: 'video/mp4' });

  it('takes the smallest file tall enough for the screen', () => {
    expect(pickFile([f(720), f(1080), f(2160)], 1000)?.height).toBe(1080);
    expect(pickFile([f(720)], 2160)?.height).toBe(720);
    expect(pickFile([], 1080)).toBeNull();
  });

  it('prefers a provider’s encode to an original much larger than the screen', () => {
    expect(pickFile([f(0), { ...f(0), url: 'large' }, f(2160)], 1080)?.url).toBe('large');
    expect(pickFile([f(0), { ...f(0), url: 'large' }, f(2160)], 2160)?.height).toBe(2160);
  });
});
