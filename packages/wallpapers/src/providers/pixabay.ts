// Pixabay — free stock videos, strong on nature, backgrounds and abstract motion.
//
// API: https://pixabay.com/api/docs/ — key as the `key` query parameter. Free keys allow 100
// requests a minute; Pixabay asks that answers be cached for 24 hours (the catalog caches them
// for its TTL, and favourites keep theirs). Credit Pixabay and the author (Credit below).

import { huesOf, initialsOf, loopLabel, resolutionLabel, type Category, type MediaFile, type Wallpaper } from '@drift/core';
import { categoryFromTags, rotation } from '../categories';
import { ProviderError, type Feed, type FeedPage, type ProviderContext, type WallpaperProvider } from '../types';

export interface PixabayConfig {
  apiKey: string;
  baseUrl?: string;
}

interface PixabayRendition {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
  thumbnail?: string;
}

interface PixabayVideo {
  id: number;
  pageURL?: string;
  tags?: string;
  duration?: number;
  picture_id?: string;
  videos?: Partial<Record<'large' | 'medium' | 'small' | 'tiny', PixabayRendition>>;
  user_id?: number;
  user?: string;
}

interface PixabayList {
  total?: number;
  totalHits?: number;
  hits?: PixabayVideo[];
}

/** Pixabay's own category, where one of Drift's matches it, to sharpen the search. */
const PIXABAY_CATEGORY: Partial<Record<Category, string>> = { Nature: 'nature', Abstract: 'backgrounds' };

const SIZES = ['tiny', 'small', 'medium', 'large'] as const;

/** "rain, window, drops" → "Rain, window, drops" → a short title from the first two tags. */
export function titleFromTags(tags: string | undefined, id: number): string {
  const words = (tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2);
  if (!words.length) return `Pixabay loop ${id}`;
  const title = words.join(' and ');
  return title[0].toUpperCase() + title.slice(1);
}

/** A Pixabay video in Drift's shape. Null when it has no playable file. */
export function fromPixabay(v: PixabayVideo, category?: Category): Wallpaper | null {
  const renditions = SIZES.map((s) => v.videos?.[s]).filter((r): r is PixabayRendition & { url: string } => !!r?.url);
  if (!v.id || !renditions.length) return null;
  const files: MediaFile[] = renditions
    .map((r) => ({ url: r.url, width: r.width ?? 0, height: r.height ?? 0, type: 'video/mp4' }))
    .sort((a, b) => a.height - b.height);
  const best = renditions[renditions.length - 1];
  // Newer answers carry a thumbnail per rendition; older ones a Vimeo picture id.
  const still = (r: PixabayRendition | undefined) => r?.thumbnail || (v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_1920x1080.jpg` : '');
  const poster = still(v.videos?.large) || still(v.videos?.medium) || still(best);
  if (!poster) return null;
  const durationMs = typeof v.duration === 'number' ? v.duration * 1000 : null;
  const name = titleFromTags(v.tags, v.id);
  const author = v.user?.trim() || null;
  const preview = renditions.find((r) => Math.min(r.width ?? 0, r.height ?? 0) >= 360) ?? renditions[0];
  return {
    id: `pixabay:${v.id}`,
    name,
    category: category ?? categoryFromTags(v.tags),
    publisher: author ?? 'Pixabay',
    initials: initialsOf(author ?? 'Pixabay'),
    description: v.tags ? `${name}. Tags: ${v.tags}.` : name,
    hues: huesOf(String(v.id)),
    res: resolutionLabel(best.width ?? 0, best.height ?? 0),
    resFull: best.width && best.height ? `${best.width} × ${best.height}` : '—',
    vertical: (best.height ?? 0) > (best.width ?? 0),
    fps: null,
    loop: loopLabel(durationMs),
    sizeMb: best.size ? Math.round(best.size / 1e6) : null,
    tier: 'free',
    media: {
      kind: 'video',
      poster,
      thumbnail: still(v.videos?.small) || still(v.videos?.tiny) || poster,
      preview: preview.url,
      files,
      durationMs,
    },
    credit: {
      provider: 'Pixabay',
      providerUrl: 'https://pixabay.com',
      author,
      authorUrl: author && v.user_id ? `https://pixabay.com/users/${encodeURIComponent(author)}-${v.user_id}/` : null,
      sourceUrl: v.pageURL ?? null,
      license: 'Pixabay Content License: free to use',
    },
  };
}

export function pixabayProvider(config: PixabayConfig, ctx: ProviderContext): WallpaperProvider {
  const base = (config.baseUrl ?? 'https://pixabay.com/api').replace(/\/+$/, '');

  async function list(params: Record<string, string | number | boolean>, category?: Category): Promise<{ items: Wallpaper[]; more: boolean }> {
    const qs = new URLSearchParams({
      key: config.apiKey,
      safesearch: 'true',
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const res = await ctx.fetch(`${base}/videos/?${qs}`);
    // Pixabay answers 400 for a bad key and 429 past its limit; never echo the URL (it has the key).
    if (!res.ok) throw new ProviderError('pixabay', res.status, `Pixabay → ${res.status}`);
    const body = (await res.json()) as PixabayList;
    const hits = body.hits ?? [];
    const page = Number(params.page ?? 1);
    const per = Number(params.per_page ?? 20);
    return {
      items: hits.map((v) => fromPixabay(v, category)).filter((w): w is Wallpaper => w !== null),
      more: page * per < (body.totalHits ?? 0),
    };
  }

  /** Pixabay has no orientation filter: prefer the app's shape when there is enough of it. */
  const shaped = (items: Wallpaper[]) => {
    const want = ctx.orientation === 'portrait';
    const match = items.filter((w) => w.vertical === want);
    return match.length >= Math.ceil(items.length / 3) ? match : items;
  };

  // Pixabay pages count from 1 and take 3–200 per page.
  const per = (size: number) => Math.min(200, Math.max(3, size));

  return {
    name: 'pixabay',
    label: 'Pixabay',
    homepage: 'https://pixabay.com',
    async page(feed: Feed, page: number, size: number): Promise<FeedPage> {
      switch (feed.kind) {
        case 'featured': {
          const r = await list({ order: 'popular', editors_choice: true, min_width: 1920, page: page + 1, per_page: per(size * 2) });
          return { items: shaped(r.items).slice(0, size), next: r.more ? page + 1 : null };
        }
        case 'trending': {
          const r = await list({ order: 'popular', page: page + 1, per_page: per(size) });
          return { items: shaped(r.items), next: r.more ? page + 1 : null };
        }
        case 'search': {
          const q = feed.query.trim();
          if (!q) return { items: [], next: null };
          const r = await list({ q, page: page + 1, per_page: per(size) });
          return { items: r.items, next: r.more ? page + 1 : null };
        }
        case 'category': {
          const { query, page: own, queries } = rotation(feed.category, page);
          const category = PIXABAY_CATEGORY[feed.category];
          const r = await list({ q: query, ...(category ? { category } : {}), page: own + 1, per_page: per(size) }, feed.category);
          return { items: r.items, next: r.more || page + 1 < queries ? page + 1 : null };
        }
      }
    },
    async get(id: string): Promise<Wallpaper | null> {
      const r = await list({ id });
      return r.items[0] ?? null;
    },
  };
}
