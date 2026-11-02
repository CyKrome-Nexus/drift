// What each category means to a stock-video search, shared by every provider that searches.

import type { Category } from '@drift/core';

/**
 * Searches that find loops which work as wallpapers: slow, ambient, no people talking to camera.
 * A category's pages rotate through its list, so scrolling keeps finding new footage.
 */
export const CATEGORY_QUERIES: Record<Category, readonly string[]> = {
  Ambient: ['rain on window', 'ocean waves', 'clouds timelapse', 'fog', 'snow falling', 'city lights night', 'candle flame', 'underwater'],
  Cosmos: ['stars night sky', 'milky way', 'northern lights', 'galaxy', 'moon', 'nebula', 'starry sky timelapse', 'earth from space'],
  Abstract: ['abstract background', 'ink in water', 'smoke', 'particles', 'bokeh', 'liquid gradient', 'neon lines', 'fractal'],
  Nature: ['forest', 'waterfall', 'flowers', 'mountains', 'river', 'leaves wind', 'jungle', 'desert dunes'],
};

/** Tags that place a trending or searched video in a category. */
const CATEGORY_TAGS: Record<Exclude<Category, 'Ambient'>, readonly string[]> = {
  Cosmos: ['space', 'stars', 'star', 'galaxy', 'night sky', 'milky way', 'aurora', 'northern lights', 'moon', 'planet', 'nebula', 'universe', 'cosmos', 'astronomy'],
  Abstract: ['abstract', 'ink', 'smoke', 'particles', 'bokeh', 'liquid', 'pattern', 'texture', 'light leaks', 'neon', 'fractal', 'background', 'gradient', 'loop'],
  Nature: ['nature', 'forest', 'tree', 'trees', 'waterfall', 'flowers', 'flower', 'mountain', 'mountains', 'river', 'leaves', 'jungle', 'landscape', 'desert'],
};

/** The category a video's tags (or title words) suggest; Ambient when nothing matches. */
export function categoryFromTags(tags: readonly string[] | string | undefined, fallback: Category = 'Ambient'): Category {
  const list = typeof tags === 'string' ? tags.split(',') : (tags ?? []);
  const set = new Set(list.map((t) => t.trim().toLowerCase()).filter(Boolean));
  for (const c of ['Cosmos', 'Abstract', 'Nature'] as const) if (CATEGORY_TAGS[c].some((t) => set.has(t))) return c;
  return fallback;
}

/** Page `page` of a category walks its queries in turn: which query, and which of its pages. */
export function rotation(category: Category, page: number): { query: string; page: number; queries: number } {
  const queries = CATEGORY_QUERIES[category];
  return { query: queries[page % queries.length], page: Math.floor(page / queries.length), queries: queries.length };
}
