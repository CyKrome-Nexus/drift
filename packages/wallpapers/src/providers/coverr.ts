// Coverr — free stock video loops, licensed for commercial use (https://coverr.co/license).
//
// API: https://api.coverr.co/docs/. Free ("Demo") keys allow 50 requests an hour; a paid Coverr
// plan moves the same key to Production (2,000 an hour) with no code change. Terms to honour:
// credit Coverr wherever its videos appear (Credit below, shown by every screen), record a
// download when one is applied or saved (`used`), and never resell the videos on their own —
// so they are free in Drift, not Pro.

import { huesOf, initialsOf, loopLabel, resolutionLabel, type Category, type Wallpaper } from '@drift/core';
import { ProviderError, type Feed, type FeedPage, type ProviderContext, type WallpaperProvider } from '../types';

export interface CoverrConfig {
  apiKey: string;
  baseUrl?: string;
}

/** What Drift searches Coverr for, per category. Pages rotate through the list. */
export const COVERR_QUERIES: Record<Category, readonly string[]> = {
  Ambient: ['rain window', 'ocean waves', 'clouds timelapse', 'fog', 'candle', 'snow falling'],
  Cosmos: ['night sky', 'stars timelapse', 'northern lights', 'milky way'],
  Abstract: ['abstract', 'ink water', 'smoke', 'particles', 'bokeh', 'liquid'],
  Nature: ['forest', 'waterfall', 'flowers', 'mountains', 'river', 'leaves'],
};

/** Tags that place a trending or searched video in a category. */
const CATEGORY_TAGS: Record<Category, readonly string[]> = {
  Cosmos: ['space', 'stars', 'star', 'galaxy', 'night sky', 'milky way', 'aurora', 'northern lights', 'moon', 'planet'],
  Abstract: ['abstract', 'ink', 'smoke', 'particles', 'bokeh', 'liquid', 'pattern', 'texture', 'light leaks'],
  Nature: ['nature', 'forest', 'tree', 'trees', 'waterfall', 'flowers', 'mountain', 'mountains', 'river', 'leaves', 'jungle'],
  Ambient: [],
};

interface CoverrVideo {
  id: string;
  title?: string;
  description?: string;
  poster?: string;
  thumbnail?: string;
  is_vertical?: boolean;
  tags?: string[];
  aspect_ratio?: string;
  duration?: number;
  max_width?: number;
  max_height?: number;
  urls?: { mp4?: string; mp4_preview?: string; mp4_download?: string };
}

interface CoverrList {
  page: number;
  pages: number;
  hits: CoverrVideo[];
}

export function categoryFromTags(tags: readonly string[] | undefined, fallback: Category = 'Ambient'): Category {
  const set = new Set((tags ?? []).map((t) => t.toLowerCase()));
  for (const c of ['Cosmos', 'Abstract', 'Nature'] as const) if (CATEGORY_TAGS[c].some((t) => set.has(t))) return c;
  return fallback;
}

/** A Coverr video in Drift's shape. Null when it has no playable file. */
export function fromCoverr(v: CoverrVideo, category: Category = categoryFromTags(v.tags)): Wallpaper | null {
  const mp4 = v.urls?.mp4;
  if (!v.id || !mp4 || !v.poster) return null;
  const width = v.max_width ?? 0;
  const height = v.max_height ?? 0;
  const durationMs = typeof v.duration === 'number' ? Math.round(v.duration * 1000) : null;
  const name = (v.title ?? 'Untitled loop').trim();
  return {
    id: `coverr:${v.id}`,
    name,
    category,
    publisher: 'Coverr',
    initials: initialsOf('Coverr'),
    description: (v.description ?? '').trim() || name,
    hues: huesOf(v.id),
    res: resolutionLabel(width, height),
    resFull: width && height ? `${width} × ${height}` : '—',
    vertical: !!v.is_vertical,
    fps: null,
    loop: loopLabel(durationMs),
    sizeMb: null,
    tier: 'free',
    media: {
      kind: 'video',
      poster: v.poster,
      thumbnail: v.thumbnail ?? v.poster,
      preview: v.urls?.mp4_preview ?? null,
      files: [{ url: mp4, width, height, type: 'video/mp4' }],
      durationMs,
    },
    credit: {
      provider: 'Coverr',
      providerUrl: 'https://coverr.co/?utm_source=drift&utm_medium=referral',
      author: null,
      authorUrl: null,
      sourceUrl: null,
      license: 'Coverr License: free for commercial use',
    },
  };
}

export function coverrProvider(config: CoverrConfig, ctx: ProviderContext): WallpaperProvider {
  const base = (config.baseUrl ?? 'https://api.coverr.co').replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' };

  async function call<T>(path: string, method = 'GET'): Promise<T | null> {
    const res = await ctx.fetch(`${base}${path}`, { headers, method });
    if (method !== 'GET') {
      if (!res.ok) throw new ProviderError('coverr', res.status, `Coverr ${method} ${path} → ${res.status}`);
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new ProviderError('coverr', res.status, `Coverr ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  async function list(params: Record<string, string | number>, category?: Category): Promise<{ items: Wallpaper[]; page: number; pages: number }> {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), urls: 'true' });
    const body = await call<CoverrList>(`/videos?${qs}`);
    const hits = body?.hits ?? [];
    return {
      items: hits.map((v) => fromCoverr(v, category ?? categoryFromTags(v.tags))).filter((w): w is Wallpaper => w !== null),
      page: body?.page ?? 0,
      pages: body?.pages ?? 0,
    };
  }

  return {
    name: 'coverr',
    label: 'Coverr',
    homepage: 'https://coverr.co/?utm_source=drift&utm_medium=referral',
    async page(feed: Feed, page: number, size: number): Promise<FeedPage> {
      switch (feed.kind) {
        case 'featured': {
          // The hero is landscape: the most popular horizontal loops.
          const r = await list({ sort: 'popular', page, page_size: size * 2 });
          return { items: r.items.filter((w) => !w.vertical).slice(0, size), next: r.page + 1 < r.pages ? page + 1 : null };
        }
        case 'trending': {
          const r = await list({ sort: 'trending', page, page_size: size });
          return { items: r.items, next: r.page + 1 < r.pages ? page + 1 : null };
        }
        case 'search': {
          const q = feed.query.trim();
          if (!q) return { items: [], next: null };
          const r = await list({ query: q, page, page_size: size });
          return { items: r.items, next: r.page + 1 < r.pages ? page + 1 : null };
        }
        case 'category': {
          const queries = COVERR_QUERIES[feed.category];
          const query = queries[page % queries.length];
          const own = Math.floor(page / queries.length);
          const r = await list({ query, page: own, page_size: size }, feed.category);
          const more = own + 1 < r.pages || page + 1 < queries.length;
          return { items: r.items, next: more ? page + 1 : null };
        }
      }
    },
    async get(id: string): Promise<Wallpaper | null> {
      const v = await call<CoverrVideo>(`/videos/${encodeURIComponent(id)}?urls=true`);
      return v ? fromCoverr(v) : null;
    },
    async used(id: string): Promise<void> {
      await call(`/videos/${encodeURIComponent(id)}/stats/downloads`, 'PATCH');
    },
  };
}
