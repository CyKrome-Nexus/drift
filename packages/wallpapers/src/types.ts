// The provider contract. Each wallpaper source (a stock-video API, Drift's generated set, later
// a paid catalog or Drift's own server) implements this once; the catalog (catalog.ts) merges
// whichever are switched on. Screens never import a provider.

import type { Category, Wallpaper } from '@drift/core';

/** A list of wallpapers a screen asks for. */
export type Feed =
  | { kind: 'featured' }
  | { kind: 'trending' }
  | { kind: 'category'; category: Category }
  | { kind: 'search'; query: string };

export interface FeedPage {
  items: Wallpaper[];
  /** The page to ask for next; null at the end. */
  next: number | null;
}

export type Fetch = (url: string, init?: { headers?: Record<string, string>; method?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface ProviderContext {
  fetch: Fetch;
}

export interface WallpaperProvider {
  /** The id prefix: `coverr` in `coverr:S1YbPl1NfI`. */
  readonly name: string;
  /** Shown in credits and Settings, e.g. "Coverr". */
  readonly label: string;
  readonly homepage: string;
  /** One page of a feed (0-based). Feeds a provider has nothing for return no items. */
  page(feed: Feed, page: number, size: number): Promise<FeedPage>;
  /**
   * One wallpaper by its own id (without the prefix), with every file listed. Lists can omit
   * full-quality files; apply and download call this first.
   */
  get(id: string): Promise<Wallpaper | null>;
  /** Tell the provider a wallpaper was applied or downloaded, where its terms ask for that. */
  used?(id: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
