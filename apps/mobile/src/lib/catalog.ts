// The wallpaper catalog for the phone, plus hooks that keep what it returns in the store's
// `known` cache. Same as the desktop's, against the phone's store.
//
// Providers run on the user's own keys (the welcome screen, Settings › Wallpaper sources), kept
// in Secure Store; see @drift/wallpapers keys.ts. A build may still set keys in .env
// (EXPO_PUBLIC_PEXELS_API_KEY, …) for development; the user's win. Saving or removing a key
// rebuilds the providers behind `catalog`, and every feed on screen reloads.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { Wallpaper, WallpaperId } from '@drift/core';
import {
  KEY_PROVIDERS,
  cleanKeys,
  configFromEnv,
  createCatalog,
  feedKey,
  withKeys,
  type Catalog,
  type Feed,
  type KeyedProvider,
  type ProviderKeys,
} from '@drift/wallpapers';
import { getState, remember, useApp } from './store';

// Expo inlines EXPO_PUBLIC_ variables only where each is read by name.
const BUILD = configFromEnv(
  {
    EXPO_PUBLIC_WALLPAPER_PROVIDERS: process.env.EXPO_PUBLIC_WALLPAPER_PROVIDERS,
    EXPO_PUBLIC_PEXELS_API_KEY: process.env.EXPO_PUBLIC_PEXELS_API_KEY,
    EXPO_PUBLIC_PIXABAY_API_KEY: process.env.EXPO_PUBLIC_PIXABAY_API_KEY,
    EXPO_PUBLIC_COVERR_API_KEY: process.env.EXPO_PUBLIC_COVERR_API_KEY,
  },
  'EXPO_PUBLIC_',
);

function build(keys: ProviderKeys): Catalog {
  return createCatalog(withKeys(BUILD, keys), {
    // Phone screens are tall: providers that can, return portrait loops.
    orientation: 'portrait',
    onError: (provider, error) => console.warn(`[catalog] ${provider}:`, error instanceof Error ? error.message : error),
  });
}

let current = build({});
let keys: ProviderKeys = {};
let version = 0;
const listeners = new Set<() => void>();

function rebuild(next: ProviderKeys): void {
  keys = cleanKeys(next);
  current = build(keys);
  version++;
  listeners.forEach((l) => l());
}

/** The catalog. Stable to hold on to: it always answers from the current providers. */
export const catalog: Catalog = {
  get providers() {
    return current.providers;
  },
  get skipped() {
    return current.skipped;
  },
  feed: (feed, page) => current.feed(feed, page),
  get: (id) => current.get(id),
  used: (w) => current.used(w),
};

/** Changes whenever the providers are rebuilt; feeds reload on it. */
export function useCatalogVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

// ---- the user's own keys ----------------------------------------------------------------------

const secureKey = (p: KeyedProvider) => `drift.key.${p}`;
const SOURCES_KEY = 'drift.mobile.sources.v1';

/** Read the saved keys and switch their providers on. Call once at startup. */
export async function loadKeys(): Promise<void> {
  const saved: ProviderKeys = {};
  for (const { name } of KEY_PROVIDERS) {
    try {
      const k = await SecureStore.getItemAsync(secureKey(name));
      if (k) saved[name] = k;
    } catch (err) {
      console.warn(`[catalog] could not read the ${name} key`, err);
    }
  }
  if (Object.keys(saved).length) rebuild(saved);
}

/** Save (or with null, remove) the user's key for `provider`, and use it at once. */
export async function setKey(provider: KeyedProvider, key: string | null): Promise<void> {
  const k = key?.trim() || null;
  if (k) await SecureStore.setItemAsync(secureKey(provider), k);
  else await SecureStore.deleteItemAsync(secureKey(provider));
  rebuild({ ...keys, [provider]: k ?? undefined });
}

/** Which providers the user has a key saved for. */
export function useKeys(): Record<KeyedProvider, boolean> {
  useCatalogVersion();
  return Object.fromEntries(KEY_PROVIDERS.map((p) => [p.name, !!keys[p.name]])) as Record<KeyedProvider, boolean>;
}

/** Whether the welcome screen has been answered (keys added, or skipped). */
export async function onboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SOURCES_KEY)) === 'done';
  } catch {
    return true;
  }
}

export function finishOnboarding(): void {
  AsyncStorage.setItem(SOURCES_KEY, 'done').catch(() => {});
}

export interface FeedState {
  items: Wallpaper[];
  loading: boolean;
  error: string | null;
  /** Load the next page; a no-op at the end or while loading. */
  more: (() => void) | null;
}

/** A feed, page by page. Changing the feed starts over. */
export function useFeed(feed: Feed | null): FeedState {
  // New providers (a key added or removed) are a new feed.
  const providers = useCatalogVersion();
  const key = feed ? `${feedKey(feed)}@${providers}` : '';
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
    const k = `${feedKey(f)}@${version}`;
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
