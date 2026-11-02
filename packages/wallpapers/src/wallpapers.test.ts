// Providers and the merged catalog, against a fake fetch that answers like Pexels, Pixabay and
// Coverr do (shapes from their API documentation). No network.

import { describe, expect, it, vi } from 'vitest';
import { pickFile, providerOf } from '@drift/core';
import {
  categoryFromTags,
  configFromEnv,
  createCatalog,
  fromCoverr,
  fromPexels,
  fromPixabay,
  interleave,
  resolveProviders,
  titleFromUrl,
  type Fetch,
} from './index';

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
  it('defaults to Pexels, Pixabay and Drift, and reads the app prefix', () => {
    expect(configFromEnv({}).providers).toEqual(['pexels', 'pixabay', 'drift']);
    expect(configFromEnv({ EXPO_PUBLIC_PEXELS_API_KEY: 'p', EXPO_PUBLIC_PIXABAY_API_KEY: 'x' }, 'EXPO_PUBLIC_')).toMatchObject({
      pexels: { apiKey: 'p' },
      pixabay: { apiKey: 'x' },
    });
    const c = configFromEnv({ VITE_WALLPAPER_PROVIDERS: ' PIXABAY , coverr,pixabay', VITE_COVERR_API_KEY: 'k' }, 'VITE_');
    expect(c.providers).toEqual(['pixabay', 'coverr']);
    expect(c.coverr?.apiKey).toBe('k');
  });

  it('skips a provider that is missing its key or unknown, and always keeps Drift last', () => {
    const env = { WALLPAPER_PROVIDERS: 'coverr,pexels,nasa', PEXELS_API_KEY: 'k' };
    const { providers, skipped } = resolveProviders(configFromEnv(env), { fetch: fakeFetch({}), orientation: 'landscape' });
    expect(providers.map((p) => p.name)).toEqual(['pexels', 'drift']);
    expect(skipped).toEqual([
      { name: 'coverr', reason: 'COVERR_API_KEY is not set' },
      // Removed providers are unknown now: an old .env still starts.
      expect.objectContaining({ name: 'nasa' }),
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

describe('catalog', () => {
  const coverrAndPixabay = (routes: Record<string, unknown>) =>
    createCatalog({ providers: ['coverr', 'pixabay', 'drift'], coverr: { apiKey: 'k' }, pixabay: { apiKey: 'k' } }, { fetch: fakeFetch(routes) });

  it('interleaves providers in order without repeats', () => {
    const a = [fromCoverr(video('1'))!, fromCoverr(video('2'))!];
    const b = [fromCoverr(video('3'))!, fromCoverr(video('1'))!];
    expect(interleave([a, b]).map((w) => w.id)).toEqual(['coverr:1', 'coverr:3', 'coverr:2']);
  });

  it('shows real wallpapers, not the generated set, when a provider has some', async () => {
    const page = await coverrAndPixabay({
      'api.coverr.co': list([video('a')]),
      'pixabay.com': { totalHits: 1, hits: [pixabayVideo(5)] },
    }).feed({ kind: 'category', category: 'Cosmos' });
    const sources = new Set(page.items.map((w) => providerOf(w.id)));
    expect(sources).toEqual(new Set(['coverr', 'pixabay']));
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
    const catalog = coverrAndPixabay({
      'api.coverr.co': (u: string) => list(u.includes('page=0') ? [video('a')] : [], 0, 1),
      'pixabay.com': { totalHits: 0, hits: [] },
    });
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

// ---- Pexels -----------------------------------------------------------------------------------

/** A Pexels video as /videos/search returns it (fields from the API documentation). */
const pexelsVideo = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  width: 3840,
  height: 2160,
  url: `https://www.pexels.com/video/rain-on-the-window-${id}/`,
  image: `https://images.pexels.com/videos/${id}/pictures/preview-0.jpg`,
  duration: 14,
  user: { id: 7, name: 'Ana Lee', url: 'https://www.pexels.com/@ana' },
  video_files: [
    { id: 1, quality: 'uhd', file_type: 'video/mp4', width: 3840, height: 2160, fps: 25, link: `https://videos.pexels.com/video-files/${id}/uhd.mp4` },
    { id: 2, quality: 'sd', file_type: 'video/mp4', width: 640, height: 360, fps: 25, link: `https://videos.pexels.com/video-files/${id}/sd.mp4` },
    { id: 3, quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, fps: 25, link: `https://videos.pexels.com/video-files/${id}/hd.mp4` },
    { id: 4, quality: 'hls', file_type: 'video/m3u8', width: null, height: null, fps: null, link: `https://videos.pexels.com/${id}.m3u8` },
  ],
  video_pictures: [{ id: 1, nr: 0, picture: `https://images.pexels.com/videos/${id}/pictures/preview-0.jpg?w=320` }],
  ...extra,
});

describe('Pexels', () => {
  it('maps a video: files smallest first, mp4 only, a 360p preview, credited to the videographer', () => {
    const w = fromPexels(pexelsVideo(2499611))!;
    expect(w).toMatchObject({ id: 'pexels:2499611', name: 'Rain on the window', res: '4K', fps: 25, loop: '0:14', tier: 'free', publisher: 'Ana Lee', vertical: false });
    expect(w.media!.files.map((f) => f.height)).toEqual([360, 1080, 2160]);
    expect(w.media!.preview).toContain('/sd.mp4');
    expect(w.credit).toMatchObject({ provider: 'Pexels', author: 'Ana Lee', sourceUrl: 'https://www.pexels.com/video/rain-on-the-window-2499611/' });
    expect(fromPexels(pexelsVideo(1, { video_files: [] }))).toBeNull();
  });

  it('makes a title from the page URL, or says which loop it is', () => {
    expect(titleFromUrl('https://www.pexels.com/video/milky-way-over-mountains-123/', 123)).toBe('Milky way over mountains');
    expect(titleFromUrl('https://www.pexels.com/video/123/', 123)).toBe('Pexels loop 123');
    expect(titleFromUrl(undefined, 9)).toBe('Pexels loop 9');
  });

  it('sends the key as is, searches in the app’s orientation, and pages from 1', async () => {
    const log: string[] = [];
    const fetch = fakeFetch({ '/videos/search': { page: 1, per_page: 12, videos: [pexelsVideo(1)], next_page: 'x' } }, log);
    const catalog = createCatalog({ providers: ['pexels'], pexels: { apiKey: 'pk' } }, { fetch, orientation: 'portrait' });
    const page = await catalog.feed({ kind: 'category', category: 'Cosmos' });
    expect((fetch as any).mock.calls[0][1].headers.Authorization).toBe('pk');
    expect(log[0]).toContain('query=stars+night+sky');
    expect(log[0]).toContain('orientation=portrait');
    expect(log[0]).toContain('page=1');
    expect(page.items[0].category).toBe('Cosmos');
    expect(page.next).toBe(1);
  });

  it('keeps popular videos in the app’s shape when there are enough', async () => {
    const tall = (id: number) => pexelsVideo(id, { width: 1080, height: 1920 });
    const fetch = fakeFetch({ '/videos/popular': { videos: [pexelsVideo(1), tall(2), tall(3)], next_page: 'x' } });
    const phone = createCatalog({ providers: ['pexels'], pexels: { apiKey: 'k' } }, { fetch, orientation: 'portrait' });
    expect((await phone.feed({ kind: 'trending' })).items.map((w) => w.id)).toEqual(['pexels:2', 'pexels:3']);
  });
});

// ---- Pixabay ----------------------------------------------------------------------------------

/** A Pixabay video as /api/videos returns it. */
const pixabayVideo = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  pageURL: `https://pixabay.com/videos/aurora-${id}/`,
  type: 'film',
  tags: 'aurora, northern lights, sky',
  duration: 30,
  videos: {
    large: { url: `https://cdn.pixabay.com/video/${id}_large.mp4`, width: 3840, height: 2160, size: 52_000_000, thumbnail: `https://cdn.pixabay.com/video/${id}_large.jpg` },
    medium: { url: `https://cdn.pixabay.com/video/${id}_medium.mp4`, width: 1920, height: 1080, size: 20_000_000, thumbnail: `https://cdn.pixabay.com/video/${id}_medium.jpg` },
    small: { url: `https://cdn.pixabay.com/video/${id}_small.mp4`, width: 1280, height: 720, size: 9_000_000, thumbnail: `https://cdn.pixabay.com/video/${id}_small.jpg` },
    tiny: { url: `https://cdn.pixabay.com/video/${id}_tiny.mp4`, width: 960, height: 540, size: 4_000_000, thumbnail: `https://cdn.pixabay.com/video/${id}_tiny.jpg` },
  },
  user_id: 42,
  user: 'skyhunter',
  ...extra,
});

describe('Pixabay', () => {
  it('maps a video: renditions smallest first, title and category from its tags, credited', () => {
    const w = fromPixabay(pixabayVideo(555))!;
    expect(w).toMatchObject({ id: 'pixabay:555', name: 'Aurora and northern lights', category: 'Cosmos', res: '4K', sizeMb: 52, loop: '0:30', tier: 'free' });
    expect(w.media!.files.map((f) => f.height)).toEqual([540, 720, 1080, 2160]);
    expect(w.media!.poster).toContain('_large.jpg');
    expect(w.media!.thumbnail).toContain('_small.jpg');
    expect(w.credit).toMatchObject({ provider: 'Pixabay', author: 'skyhunter', authorUrl: 'https://pixabay.com/users/skyhunter-42/' });
  });

  it('skips missing renditions, and falls back to the Vimeo picture for older answers', () => {
    const old = pixabayVideo(7, {
      picture_id: '1234',
      videos: { large: { url: '', width: 0, height: 0 }, medium: { url: 'https://cdn.pixabay.com/video/7_medium.mp4', width: 1920, height: 1080 } },
    });
    const w = fromPixabay(old)!;
    expect(w.media!.files).toHaveLength(1);
    expect(w.media!.poster).toBe('https://i.vimeocdn.com/video/1234_1920x1080.jpg');
    expect(fromPixabay(pixabayVideo(8, { videos: {} }))).toBeNull();
  });

  it('passes the key, pages from 1, narrows nature to Pixabay’s own category, and never leaks the key in errors', async () => {
    const log: string[] = [];
    const ok = createCatalog({ providers: ['pixabay'], pixabay: { apiKey: 'secret' } }, {
      fetch: fakeFetch({ '/videos/?': { totalHits: 500, hits: [pixabayVideo(1)] } }, log),
    });
    const page = await ok.feed({ kind: 'category', category: 'Nature' });
    expect(log[0]).toContain('key=secret');
    expect(log[0]).toContain('category=nature');
    expect(log[0]).toContain('safesearch=true');
    expect(log[0]).toContain('page=1');
    expect(page.next).toBe(1);

    const onError = vi.fn();
    const bad = createCatalog({ providers: ['pixabay'], pixabay: { apiKey: 'secret' } }, { fetch: fakeFetch({ '/videos/?': new Error('limit') }), onError });
    await bad.feed({ kind: 'trending' });
    expect(String(onError.mock.calls[0][1].message)).not.toContain('secret');
  });

  it('looks a single video up by id', async () => {
    const log: string[] = [];
    const catalog = createCatalog({ providers: ['pixabay'], pixabay: { apiKey: 'k' } }, { fetch: fakeFetch({ '/videos/?': { totalHits: 1, hits: [pixabayVideo(99)] } }, log) });
    expect((await catalog.get('pixabay:99'))?.name).toBe('Aurora and northern lights');
    expect(log[0]).toContain('id=99');
  });
});

describe('categories', () => {
  it('reads tags as a list or Pixabay’s comma string', () => {
    expect(categoryFromTags(['forest', 'fog'])).toBe('Nature');
    expect(categoryFromTags('ink, water, colour')).toBe('Abstract');
    expect(categoryFromTags('city, rain')).toBe('Ambient');
  });
});

describe('connections (bring your own keys)', () => {
  const conn = (id: string, type: 'pexels' | 'pixabay' | 'coverr', key: string, name = type) => ({ id, type, name, key });

  it('names connections after their provider, numbering repeats', async () => {
    const { defaultName, cleanName } = await import('./index');
    expect(defaultName('pexels', [])).toBe('Pexels');
    expect(defaultName('pexels', [{ name: 'Pexels' }, { name: 'pexels 2' }])).toBe('Pexels 3');
    expect(defaultName('pixabay', [{ name: 'Pexels' }])).toBe('Pixabay');
    expect(cleanName('  Work   account  ', 'pexels')).toBe('Work account');
    expect(cleanName('   ', 'coverr')).toBe('Coverr');
    expect(cleanName('x'.repeat(60), 'pexels')).toHaveLength(40);
  });

  it('reads back only well-formed connections, each once', async () => {
    const { sanitizeConnections } = await import('./index');
    expect(
      sanitizeConnections([
        { id: 'pexels-abc12345', type: 'pexels', name: ' Mine ' },
        { id: 'pexels-abc12345', type: 'pexels', name: 'again' },
        { id: 'pixabay-zz99', type: 'pexels', name: 'wrong type' },
        { id: 'nasa-12345', type: 'nasa', name: 'gone' },
        { id: '../x', type: 'pexels' },
        null,
      ]),
    ).toEqual([{ id: 'pexels-abc12345', type: 'pexels', name: 'Mine' }]);
    expect(sanitizeConnections('nope')).toEqual([]);
  });

  it('turns connections into keys per provider, in the user’s order, ahead of the build’s', async () => {
    const { withConnections } = await import('./index');
    const build = configFromEnv({ WALLPAPER_PROVIDERS: 'pixabay,drift', PIXABAY_API_KEY: 'from-build' });
    const c = withConnections(build, [
      conn('pexels-a1', 'pexels', ' p1 '),
      conn('pixabay-b1', 'pixabay', 'x1'),
      conn('pexels-a2', 'pexels', 'p2'),
      conn('coverr-c1', 'coverr', ''),
    ]);
    expect(c.providers).toEqual(['pexels', 'pixabay', 'drift']);
    expect(c.pexels).toMatchObject({ apiKey: 'p1', apiKeys: ['p2'] });
    // The build's own key comes after the user's.
    expect(c.pixabay).toMatchObject({ apiKey: 'x1', apiKeys: ['from-build'] });
    expect(c.coverr).toBeUndefined();
    expect(build.providers).toEqual(['pixabay', 'drift']);
  });

  it('falls over to the next key when one is refused or spent, and stays on the one that works', async () => {
    const { withConnections } = await import('./index');
    const seen: string[] = [];
    const fetch: Fetch = vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
      const key = init!.headers!.Authorization;
      seen.push(key);
      if (key === 'spent') return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ videos: [pexelsVideo(1)], next_page: 'x' }) };
    });
    const config = withConnections({ providers: ['drift'] }, [conn('pexels-a1', 'pexels', 'spent'), conn('pexels-a2', 'pexels', 'good')]);
    const catalog = createCatalog(config, { fetch });
    expect((await catalog.feed({ kind: 'trending' })).items[0].id).toBe('pexels:1');
    await catalog.feed({ kind: 'search', query: 'rain' });
    expect(seen).toEqual(['spent', 'good', 'good']);
  });

  it('does not burn through keys for a problem that is not the key', async () => {
    const { failover, ProviderError } = await import('./index');
    const down = { name: 'pexels', label: 'Pexels', homepage: '', page: vi.fn(async () => { throw new ProviderError('pexels', 503, 'down'); }), get: vi.fn() };
    const other = { ...down, page: vi.fn() };
    await expect(failover([down, other]).page({ kind: 'trending' }, 0, 1)).rejects.toThrow('down');
    expect(other.page).not.toHaveBeenCalled();
  });

  it('checks a key with one request and tells a bad key from a bad connection', async () => {
    const { verifyKey } = await import('./index');
    const answer = (status: number): Fetch => vi.fn(async () => ({ ok: status < 300, status, json: async () => ({}) }));
    expect(await verifyKey('pexels', 'k', answer(200))).toBe('ok');
    expect(await verifyKey('pexels', 'k', answer(401))).toBe('invalid');
    expect(await verifyKey('pixabay', 'k', answer(400))).toBe('invalid');
    expect(await verifyKey('pixabay', 'k', answer(429))).toBe('unreachable');
    expect(await verifyKey('coverr', 'k', answer(401))).toBe('invalid');
    expect(await verifyKey('pexels', 'k', vi.fn(async () => { throw new Error('offline'); }))).toBe('unreachable');
    expect(await verifyKey('pexels', '   ', answer(200))).toBe('invalid');
    const sent = answer(200);
    await verifyKey('coverr', ' key ', sent);
    expect((sent as any).mock.calls[0][1].headers.Authorization).toBe('Bearer key');
  });
});
