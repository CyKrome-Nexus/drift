// Pexels — free stock videos, the largest free library of them, with portrait footage for phones.
//
// API: https://www.pexels.com/api/documentation/ — key in the Authorization header (no
// "Bearer"). Free keys allow 200 requests an hour and 20,000 a month; Pexels raises that on request.
// Credit the videographer and Pexels wherever a video is shown (Credit below).

import { huesOf, initialsOf, loopLabel, resolutionLabel, type Category, type MediaFile, type Wallpaper } from '@drift/core';
import { categoryFromTags, rotation } from '../categories';
import { ProviderError, type Feed, type FeedPage, type ProviderContext, type WallpaperProvider } from '../types';

export interface PexelsConfig {
  apiKey: string;
  baseUrl?: string;
}

interface PexelsFile {
  id?: number;
  quality?: string | null;
  file_type?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  link?: string;
}

interface PexelsVideo {
  id: number;
  width?: number;
  height?: number;
  url?: string;
  image?: string;
  duration?: number;
  user?: { id?: number; name?: string; url?: string };
  video_files?: PexelsFile[];
  video_pictures?: Array<{ picture?: string; nr?: number }>;
}

interface PexelsList {
  page?: number;
  per_page?: number;
  total_results?: number;
  next_page?: string;
  videos?: PexelsVideo[];
}

/** "rain-on-the-window-2499611" → "Rain on the window": Pexels videos have no title field. */
export function titleFromUrl(url: string | undefined, id: number): string {
  const slug = url?.match(/\/video\/([^/?#]+)\/?$/)?.[1] ?? '';
  const words = slug.replace(/-?\d+$/, '').replace(/-/g, ' ').trim();
  if (!words) return `Pexels loop ${id}`;
  return words[0].toUpperCase() + words.slice(1);
}

/** A Pexels video in Drift's shape. Null when it has no playable mp4. */
export function fromPexels(v: PexelsVideo, category?: Category): Wallpaper | null {
  const files: MediaFile[] = (v.video_files ?? [])
    .filter((f): f is PexelsFile & { link: string } => !!f.link && (f.file_type ?? 'video/mp4') === 'video/mp4')
    .map((f) => ({ url: f.link, width: f.width ?? 0, height: f.height ?? 0, type: 'video/mp4' }))
    // Smallest first, one file per height.
    .sort((a, b) => a.height - b.height || a.width - b.width)
    .filter((f, i, all) => i === 0 || f.height !== all[i - 1].height || f.height === 0);
  if (!v.id || !files.length || !v.image) return null;
  const width = v.width ?? files[files.length - 1].width;
  const height = v.height ?? files[files.length - 1].height;
  const durationMs = typeof v.duration === 'number' ? v.duration * 1000 : null;
  const name = titleFromUrl(v.url, v.id);
  const author = v.user?.name?.trim() || null;
  const fps = Math.max(0, ...(v.video_files ?? []).map((f) => Math.round(f.fps ?? 0)));
  // The smallest file a card can still fill: about 360 lines on the short side.
  const preview = files.find((f) => Math.min(f.width, f.height) >= 360) ?? files[0];
  return {
    id: `pexels:${v.id}`,
    name,
    category: category ?? categoryFromTags(name.toLowerCase().split(/\s+/)),
    publisher: author ?? 'Pexels',
    initials: initialsOf(author ?? 'Pexels'),
    description: author ? `${name}, filmed by ${author}.` : name,
    hues: huesOf(String(v.id)),
    res: resolutionLabel(width, height),
    resFull: width && height ? `${width} × ${height}` : '—',
    vertical: height > width,
    fps: fps || null,
    loop: loopLabel(durationMs),
    sizeMb: null,
    tier: 'free',
    media: {
      kind: 'video',
      poster: v.image,
      thumbnail: v.video_pictures?.[0]?.picture ?? v.image,
      preview: preview.url,
      files,
      durationMs,
    },
    credit: {
      provider: 'Pexels',
      providerUrl: 'https://www.pexels.com',
      author,
      authorUrl: v.user?.url ?? null,
      sourceUrl: v.url ?? null,
      license: 'Pexels License: free to use',
    },
  };
}

export function pexelsProvider(config: PexelsConfig, ctx: ProviderContext): WallpaperProvider {
  const base = (config.baseUrl ?? 'https://api.pexels.com').replace(/\/+$/, '');
  const headers = { Authorization: config.apiKey, Accept: 'application/json' };

  async function call<T>(path: string): Promise<T | null> {
    const res = await ctx.fetch(`${base}${path}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new ProviderError('pexels', res.status, `Pexels ${path.split('?')[0]} → ${res.status}`);
    return (await res.json()) as T;
  }

  async function list(path: string, params: Record<string, string | number>, category?: Category): Promise<FeedPage & { raw: number }> {
    // Pexels pages count from 1.
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const body = await call<PexelsList>(`${path}?${qs}`);
    const videos = body?.videos ?? [];
    const items = videos.map((v) => fromPexels(v, category)).filter((w): w is Wallpaper => w !== null);
    return { items, next: body?.next_page ? 1 : null, raw: videos.length };
  }

  /** Popular videos have no orientation filter: keep the app's shape when there is enough of it. */
  const shaped = (items: Wallpaper[]) => {
    const want = ctx.orientation === 'portrait';
    const match = items.filter((w) => w.vertical === want);
    return match.length >= Math.ceil(items.length / 3) ? match : items;
  };

  return {
    name: 'pexels',
    label: 'Pexels',
    homepage: 'https://www.pexels.com',
    async page(feed: Feed, page: number, size: number): Promise<FeedPage> {
      const orientation = ctx.orientation;
      switch (feed.kind) {
        case 'featured':
        case 'trending': {
          // Featured asks for at least Full HD on the long side, so the hero looks right.
          const min: Record<string, number> = feed.kind === 'featured' ? { [orientation === 'portrait' ? 'min_height' : 'min_width']: 1920 } : {};
          const r = await list('/videos/popular', { ...min, page: page + 1, per_page: size * 2 });
          const items = shaped(r.items).slice(0, size);
          return { items, next: r.next !== null ? page + 1 : null };
        }
        case 'search': {
          const query = feed.query.trim();
          if (!query) return { items: [], next: null };
          const r = await list('/videos/search', { query, orientation, page: page + 1, per_page: size });
          return { items: r.items, next: r.next !== null ? page + 1 : null };
        }
        case 'category': {
          const { query, page: own, queries } = rotation(feed.category, page);
          const r = await list('/videos/search', { query, orientation, size: 'medium', page: own + 1, per_page: size }, feed.category);
          return { items: r.items, next: r.next !== null || page + 1 < queries ? page + 1 : null };
        }
      }
    },
    async get(id: string): Promise<Wallpaper | null> {
      const v = await call<PexelsVideo>(`/videos/videos/${encodeURIComponent(id)}`);
      return v ? fromPexels(v) : null;
    },
  };
}
