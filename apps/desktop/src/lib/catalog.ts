// The wallpaper catalog for the desktop, plus hooks that keep what it returns in the store's
// `known` cache.
//
// Providers run on the user's own keys (welcome screen, Settings › Wallpaper sources), kept in
// the OS credential store; see @drift/wallpapers keys.ts. A build may still set keys in .env
// (VITE_PEXELS_API_KEY, …) for development; the user's win. Saving or removing a key rebuilds the
// providers behind `catalog`, and every feed on screen reloads.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import { inTauri } from './platform';
import { getState, remember, useApp } from './store';

const BUILD = configFromEnv(import.meta.env as Record<string, string | undefined>, 'VITE_');

function build(keys: ProviderKeys): Catalog {
  const made = createCatalog(withKeys(BUILD, keys), {
    onError: (provider, error) => console.warn(`[catalog] ${provider}:`, error instanceof Error ? error.message : error),
  });
  for (const { name, reason } of made.skipped) console.info(`[catalog] ${name} is off: ${reason}`);
  return made;
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

/** Outside the desktop app (`vite` alone, for design work) keys live in the page's storage. */
const DEV_KEYS = 'drift.desktop.devkeys.v1';
const SOURCES_KEY = 'drift.desktop.sources.v1';

async function readKey(p: KeyedProvider): Promise<string | undefined> {
  if (inTauri) return (await invoke<string | null>('provider_key_get', { provider: p })) ?? undefined;
  try {
    return JSON.parse(localStorage.getItem(DEV_KEYS) ?? '{}')[p];
  } catch {
    return undefined;
  }
}

async function writeKey(p: KeyedProvider, key: string | null): Promise<void> {
  if (inTauri) {
    await (key ? invoke('provider_key_set', { provider: p, key }) : invoke('provider_key_clear', { provider: p }));
    return;
  }
  const all = (() => {
    try {
      return JSON.parse(localStorage.getItem(DEV_KEYS) ?? '{}');
    } catch {
      return {};
    }
  })();
  if (key) all[p] = key;
  else delete all[p];
  localStorage.setItem(DEV_KEYS, JSON.stringify(all));
}

/** Read the saved keys and switch their providers on. Call once at startup. */
export async function loadKeys(): Promise<void> {
  const saved: ProviderKeys = {};
  for (const { name } of KEY_PROVIDERS) {
    try {
      const k = await readKey(name);
      if (k) saved[name] = k;
    } catch (err) {
      console.warn(`[catalog] could not read the ${name} key`, err);
    }
  }
  if (Object.keys(saved).length) rebuild(saved);
}

/** Save (or with null, remove) the user's key for `provider`, and use it at once. */
export async function setKey(provider: KeyedProvider, key: string | null): Promise<void> {
  await writeKey(provider, key?.trim() || null);
  rebuild({ ...keys, [provider]: key?.trim() || undefined });
}

/** Which providers the user has a key saved for. */
export function useKeys(): Record<KeyedProvider, boolean> {
  useCatalogVersion();
  return Object.fromEntries(KEY_PROVIDERS.map((p) => [p.name, !!keys[p.name]])) as Record<KeyedProvider, boolean>;
}

/** Whether the welcome screen has been answered (keys added, or skipped). */
export function onboarded(): boolean {
  try {
    return localStorage.getItem(SOURCES_KEY) === 'done';
  } catch {
    return true;
  }
}

export function finishOnboarding(): void {
  try {
    localStorage.setItem(SOURCES_KEY, 'done');
  } catch {
    // Not remembered: the welcome screen shows again next launch, nothing worse.
  }
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
