// The catalog every screen reads: the switched-on providers merged into one set of feeds.
//
// - Pages interleave the providers in priority order and drop repeats.
// - Fallback providers (Drift's generated set) appear only where no other provider has anything
//   for that feed: with Coverr and NASA on, Drift shows their wallpapers; offline, or for a
//   category no provider covers, it shows its own.
// - A provider that fails is reported (`onError`) and treated as empty, so one outage or a spent
//   rate limit never blanks the screen.
// - Answers are kept for `ttlMs` (default 30 minutes): free API keys have hourly limits.

import { providerOf, type Wallpaper } from '@drift/core';
import { FALLBACK_PROVIDERS, resolveProviders, type WallpaperConfig } from './config';
import type { Feed, FeedPage, Fetch, WallpaperProvider } from './types';

export interface CatalogOptions {
  fetch?: Fetch;
  /** Wallpapers per provider per page. */
  pageSize?: number;
  ttlMs?: number;
  now?: () => number;
  onError?: (provider: string, error: unknown) => void;
}

export interface ProviderInfo {
  name: string;
  label: string;
  homepage: string;
}

export interface Catalog {
  /** The providers serving wallpapers, in priority order. */
  readonly providers: readonly ProviderInfo[];
  /** Providers listed in the config that could not start, and why. */
  readonly skipped: ReadonlyArray<{ name: string; reason: string }>;
  feed(feed: Feed, page?: number): Promise<FeedPage>;
  /** A wallpaper with every file listed (lists may omit full-quality files). */
  get(id: string): Promise<Wallpaper | null>;
  /** Tell the wallpaper's provider it was applied or downloaded. Never throws. */
  used(w: Pick<Wallpaper, 'id'>): Promise<void>;
}

export function feedKey(feed: Feed): string {
  switch (feed.kind) {
    case 'category':
      return `category:${feed.category}`;
    case 'search':
      return `search:${feed.query.trim().toLowerCase()}`;
    default:
      return feed.kind;
  }
}

/** Round-robin, in provider order, without repeats. */
export function interleave(pages: readonly Wallpaper[][]): Wallpaper[] {
  const out: Wallpaper[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...pages.map((p) => p.length));
  for (let i = 0; i < longest; i++) {
    for (const page of pages) {
      const w = page[i];
      if (w && !seen.has(w.id)) {
        seen.add(w.id);
        out.push(w);
      }
    }
  }
  return out;
}

export function createCatalog(config: WallpaperConfig, options: CatalogOptions = {}): Catalog {
  const fetchImpl: Fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const pageSize = options.pageSize ?? 12;
  const ttlMs = options.ttlMs ?? 30 * 60_000;
  const now = options.now ?? Date.now;
  const report = options.onError ?? (() => {});
  const { providers, skipped } = resolveProviders(config, { fetch: fetchImpl });
  const primary = providers.filter((p) => !FALLBACK_PROVIDERS.has(p.name));
  const fallback = providers.filter((p) => FALLBACK_PROVIDERS.has(p.name));
  const byName = new Map(providers.map((p) => [p.name, p]));

  const pages = new Map<string, { at: number; value: Promise<FeedPage> }>();
  const singles = new Map<string, { at: number; value: Promise<Wallpaper | null> }>();

  function cached<T>(map: Map<string, { at: number; value: Promise<T> }>, key: string, make: () => Promise<T>): Promise<T> {
    const hit = map.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = make();
    map.set(key, { at: now(), value });
    // A failure is not remembered: the next ask tries again.
    value.catch(() => map.delete(key));
    return value;
  }

  async function ask(group: WallpaperProvider[], feed: Feed, page: number): Promise<{ items: Wallpaper[]; next: boolean }> {
    const results = await Promise.all(
      group.map(async (p) => {
        try {
          return await p.page(feed, page, pageSize);
        } catch (error) {
          report(p.name, error);
          return { items: [], next: null } satisfies FeedPage;
        }
      }),
    );
    return { items: interleave(results.map((r) => r.items)), next: results.some((r) => r.next !== null) };
  }

  async function load(feed: Feed, page: number): Promise<FeedPage> {
    const main = await ask(primary, feed, page);
    if (main.items.length || (page > 0 && main.next)) return { items: main.items, next: main.next ? page + 1 : null };
    // Nothing real for this feed (or past the real pages): Drift's own, from their first page.
    if (page > 0) {
      const first = await feedPage(feed, 0);
      if (first.items.some((w) => !FALLBACK_PROVIDERS.has(providerOf(w.id)))) return { items: [], next: null };
    }
    const backup = await ask(fallback, feed, page);
    return { items: backup.items, next: backup.next ? page + 1 : null };
  }

  function feedPage(feed: Feed, page: number): Promise<FeedPage> {
    return cached(pages, `${feedKey(feed)}#${page}`, () => load(feed, page));
  }

  return {
    providers: providers.map(({ name, label, homepage }) => ({ name, label, homepage })),
    skipped,
    feed: (feed, page = 0) => feedPage(feed, page),
    get(id: string): Promise<Wallpaper | null> {
      const provider = byName.get(providerOf(id));
      if (!provider) return Promise.resolve(null);
      return cached(singles, id, () => provider.get(id.slice(provider.name.length + 1)));
    },
    async used(w): Promise<void> {
      const provider = byName.get(providerOf(w.id));
      try {
        await provider?.used?.(w.id.slice(provider.name.length + 1));
      } catch (error) {
        report(provider!.name, error);
      }
    },
  };
}
