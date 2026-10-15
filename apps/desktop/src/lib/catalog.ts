// The wallpaper catalog for the desktop: the providers the build's env switches on (see
// @drift/wallpapers config.ts — VITE_WALLPAPER_PROVIDERS, VITE_COVERR_API_KEY), plus hooks that
// keep what they return in the store's `known` cache.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Wallpaper, WallpaperId } from '@drift/core';
import { configFromEnv, createCatalog, feedKey, type Feed } from '@drift/wallpapers';
import { getState, remember, useApp } from './store';

export const catalog = createCatalog(configFromEnv(import.meta.env as Record<string, string | undefined>, 'VITE_'), {
  onError: (provider, error) => console.warn(`[catalog] ${provider}:`, error instanceof Error ? error.message : error),
});

for (const { name, reason } of catalog.skipped) console.warn(`[catalog] ${name} is off: ${reason}`);

export interface FeedState {
  items: Wallpaper[];
  loading: boolean;
  error: string | null;
  /** Load the next page; a no-op at the end or while loading. */
  more: (() => void) | null;
}

/** A feed, page by page. Changing the feed starts over. */
export function useFeed(feed: Feed | null): FeedState {
  const key = feed ? feedKey(feed) : '';
  const [state, setState] = useState<{ key: string; items: Wallpaper[]; next: number | null; loading: boolean; error: string | null }>({
    key,
    items: [],
    next: 0,
    loading: !!feed,
    error: null,
  });
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const load = useCallback((page: number, reset: boolean) => {
    const f = feedRef.current;
    if (!f) return;
    const k = feedKey(f);
    setState((s) => ({ ...(reset ? { key: k, items: [], next: page } : s), loading: true, error: null }));
    catalog.feed(f, page).then(
      (p) => {
        remember(p.items);
        // An answer for a feed the screen has moved on from is dropped.
        setState((s) =>
          s.key !== k
            ? s
            : { key: k, items: reset ? p.items : [...s.items, ...p.items.filter((w) => !s.items.some((x) => x.id === w.id))], next: p.next, loading: false, error: null },
        );
      },
      (e: unknown) => setState((s) => (s.key !== k ? s : { ...s, loading: false, error: e instanceof Error ? e.message : String(e) })),
    );
  }, []);

  useEffect(() => {
    if (feed) load(0, true);
    else setState({ key: '', items: [], next: null, loading: false, error: null });
    // The feed's identity is its key; a new object for the same feed is not a new feed.
  }, [key, load]);

  const current = state.key === key ? state : { items: [], next: 0, loading: !!feed, error: null };
  return {
    items: current.items,
    loading: current.loading,
    error: current.error,
    more: current.next !== null && !current.loading && current.items.length > 0 ? () => load(current.next!, false) : null,
  };
}

/** A wallpaper by id: at once from `known`, otherwise from its provider. Undefined while loading, null if gone. */
export function useWallpaper(id: WallpaperId | null): Wallpaper | null | undefined {
  const known = useApp((s) => (id ? s.known[id] : undefined));
  const [missing, setMissing] = useState<WallpaperId | null>(null);
  useEffect(() => {
    if (!id || known) return;
    let live = true;
    catalog.get(id).then(
      (w) => {
        if (!live) return;
        if (w) remember([w]);
        else setMissing(id);
      },
      () => live && setMissing(id),
    );
    return () => {
      live = false;
    };
  }, [id, known]);
  if (!id) return null;
  return known ?? (missing === id ? null : undefined);
}

/** Wallpapers by id from `known`, in order, skipping any this device has never seen. */
export function useKnown(ids: readonly WallpaperId[]): Wallpaper[] {
  const known = useApp((s) => s.known);
  return ids.map((id) => known[id]).filter((w): w is Wallpaper => !!w);
}

/**
 * `w` with every file listed and fresh links, for applying or downloading. Falls back to what
 * is known when the provider can't be reached (Coverr's links do not expire).
 */
export async function resolve(w: Wallpaper): Promise<Wallpaper> {
  if (!w.media) return w;
  try {
    const fresh = await catalog.get(w.id);
    if (!fresh) return w;
    // A provider's single-item answer cannot know which feed it was shown in.
    const merged = { ...fresh, category: w.category };
    remember([merged]);
    return merged;
  } catch {
    return getState().known[w.id] ?? w;
  }
}
