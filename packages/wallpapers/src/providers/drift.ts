// Drift's own generated wallpapers: gradient loops painted on the device, no network and no
// licence to honour. Always available, so Drift has something to show offline or with every
// other provider switched off.

import { GENERATED_FEATURED, GENERATED_TRENDING, generatedWallpapers, type Wallpaper } from '@drift/core';
import type { Feed, FeedPage, WallpaperProvider } from '../types';

function slice(all: Wallpaper[], page: number, size: number): FeedPage {
  const items = all.slice(page * size, (page + 1) * size);
  return { items, next: (page + 1) * size < all.length ? page + 1 : null };
}

export function driftProvider(): WallpaperProvider {
  return {
    name: 'drift',
    label: 'Drift',
    homepage: 'https://nexus.cykrome.com/drift/',
    async page(feed: Feed, page: number, size: number): Promise<FeedPage> {
      const all = generatedWallpapers();
      switch (feed.kind) {
        case 'featured':
          return slice(GENERATED_FEATURED.map((i) => all[i]), page, size);
        case 'trending':
          return slice(GENERATED_TRENDING.map((i) => all[i]), page, size);
        case 'category':
          return slice(all.filter((w) => w.category === feed.category), page, size);
        case 'search': {
          const q = feed.query.trim().toLowerCase();
          if (!q) return { items: [], next: null };
          return slice(all.filter((w) => [w.name, w.publisher, w.category].some((s) => s.toLowerCase().includes(q))), page, size);
        }
      }
    },
    async get(id: string): Promise<Wallpaper | null> {
      return generatedWallpapers().find((w) => w.id === `drift:${id}`) ?? null;
    },
  };
}
