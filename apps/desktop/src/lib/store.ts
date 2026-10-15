// App state: one object, one subscribe, read through `useApp`. Small enough that a library would
// cost more than it saves.

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_DESKTOP_SETTINGS,
  clampToPlan,
  generatedWallpapers,
  hydrate,
  migrateId,
  migrateIds,
  type DesktopSettings,
  type ProFeature,
  type Wallpaper,
  type WallpaperId,
} from '@drift/core';
import { INITIAL_ACCOUNT, type AccountState, type PlanState } from '@drift/account';
import type { ApplyRequest, Assignment } from './platform';

export type Section = 'General' | 'Playback' | 'Performance' | 'Displays' | 'Library & storage' | 'Account' | 'About';
export type BrowseTab = 'Discover' | 'Library' | 'Favourites';

export type View =
  | { name: 'home' }
  | { name: 'browse'; tab: BrowseTab }
  | { name: 'detail'; id: WallpaperId; back: View }
  | { name: 'settings'; section: Section; back: View };

export interface WallpaperList {
  id: string;
  name: string;
  items: WallpaperId[];
}

export interface UpdatePrefs {
  mode: 'auto' | 'notify' | 'manual';
  checkOnStartup: boolean;
}

/** What the engine is showing. Set only from the engine. */
export interface Current {
  /** The wallpaper applied last, and when its loop started. */
  id: WallpaperId;
  startedAtMs: number;
  /** What each display shows, each with its own loop clock ("Per display" can differ). */
  displays: Assignment[];
  /** Why playback is paused (battery, fullscreen app, CPU), or null while it plays. */
  paused: string | null;
}

/** A display's wallpaper, kept for "Resume last wallpaper on startup" with "Per display". */
export interface DisplayChoice {
  display: string;
  wallpaperId: WallpaperId;
}

export interface AppState {
  view: View;
  query: string;
  favs: WallpaperId[];
  lists: WallpaperList[];
  /**
   * Every wallpaper this device has shown, by id: favourites, lists, history and resume read it,
   * so they appear at once and work offline. Providers' answers refresh it.
   */
  known: Record<WallpaperId, Wallpaper>;
  /** Creators followed on the phone. Desktop has no follow UI yet; kept so sync preserves them. */
  following: string[];
  settings: DesktopSettings;
  updatePrefs: UpdatePrefs;
  toast: { id: number; text: string; tone: 'ok' | 'info' } | null;
  account: AccountState;
  upgrade: { open: boolean; feature: ProFeature | null };
  /** The wallpaper the engine is showing right now, and when its loop started. Set only from the engine. */
  current: Current | null;
  /** The last wallpaper applied, kept across launches for "Resume last wallpaper on startup". */
  lastApplied: ApplyRequest | null;
  /** Each display's wallpaper the last time "Per display" ran, for the same. */
  lastDisplays: DisplayChoice[];
}

const STORAGE_KEY = 'drift.desktop.v1';
const KNOWN_KEY = 'drift.desktop.known.v1';
/** Beyond what the library and history hold, how many recently seen wallpapers to keep. */
const KNOWN_RECENT = 200;

interface Persisted {
  favs: WallpaperId[];
  lists: WallpaperList[];
  following: string[];
  settings: DesktopSettings;
  updatePrefs: UpdatePrefs;
  lastApplied: ApplyRequest | null;
  lastDisplays: DisplayChoice[];
}

const DEFAULT_UPDATE_PREFS: UpdatePrefs = { mode: 'notify', checkOnStartup: true };

function readJson(key: string): any {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    // Unreadable storage is a fresh install, not an error.
    return {};
  }
}

/** Saved state, with wallpaper ids from before providers (numbers) carried over. */
function load(): Persisted {
  const raw = readJson(STORAGE_KEY);
  const lastId = migrateId(raw.lastApplied?.wallpaperId);
  return {
    favs: Array.isArray(raw.favs) ? migrateIds(raw.favs) : [],
    lists: Array.isArray(raw.lists)
      ? raw.lists
          .filter((l: any) => typeof l?.id === 'string' && typeof l?.name === 'string')
          .map((l: any) => ({ id: l.id, name: l.name, items: migrateIds(l.items) }))
      : [{ id: 'workspace', name: 'Workspace', items: [] }],
    following: Array.isArray(raw.following) ? raw.following.filter((p: unknown) => typeof p === 'string') : [],
    settings: hydrate(raw.settings, DEFAULT_DESKTOP_SETTINGS),
    updatePrefs: hydrate(raw.updatePrefs, DEFAULT_UPDATE_PREFS),
    lastApplied: lastId ? { ...raw.lastApplied, wallpaperId: lastId, media: raw.lastApplied.media ?? null } : null,
    lastDisplays: Array.isArray(raw.lastDisplays)
      ? raw.lastDisplays
          .map((d: any) => ({ display: d?.display, wallpaperId: migrateId(d?.wallpaperId) }))
          .filter((d: any): d is DisplayChoice => typeof d.display === 'string' && d.wallpaperId !== null)
      : [],
  };
}

function loadKnown(): Record<WallpaperId, Wallpaper> {
  const raw = readJson(KNOWN_KEY);
  const known: Record<WallpaperId, Wallpaper> = {};
  for (const [id, w] of Object.entries(raw)) if (w && typeof w === 'object' && (w as Wallpaper).id === id) known[id] = w as Wallpaper;
  // The generated set is always known: old favourites point at it.
  for (const w of generatedWallpapers()) known[w.id] = w;
  return known;
}

/** What `known` keeps: everything referenced, then the most recently seen. */
function pruneKnown(s: AppState): Record<WallpaperId, Wallpaper> {
  const keep = new Set<WallpaperId>([
    ...s.favs,
    ...s.lists.flatMap((l) => l.items),
    ...(s.lastApplied ? [s.lastApplied.wallpaperId] : []),
    ...s.lastDisplays.map((d) => d.wallpaperId),
    ...(s.current ? [s.current.id, ...s.current.displays.map((d) => d.wallpaperId)] : []),
  ]);
  const ids = Object.keys(s.known);
  const recent = ids.filter((id) => !keep.has(id) && !id.startsWith('drift:')).slice(-KNOWN_RECENT);
  const out: Record<WallpaperId, Wallpaper> = {};
  for (const id of [...keep, ...recent]) if (s.known[id] && !id.startsWith('drift:')) out[id] = s.known[id];
  return out;
}

const persisted = load();

let state: AppState = {
  view: { name: 'home' },
  query: '',
  ...persisted,
  known: loadKnown(),
  toast: null,
  account: INITIAL_ACCOUNT,
  upgrade: { open: false, feature: null },
  current: null,
};

const PERSISTED_KEYS: ReadonlyArray<keyof Persisted> = ['favs', 'lists', 'following', 'settings', 'updatePrefs', 'lastApplied', 'lastDisplays'];
let knownTimer: ReturnType<typeof setTimeout> | undefined;

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if (PERSISTED_KEYS.some((k) => k in next)) {
    try {
      const { favs, lists, following, settings, updatePrefs, lastApplied, lastDisplays } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ favs, lists, following, settings, updatePrefs, lastApplied, lastDisplays } satisfies Persisted));
    } catch {
      // Storage full or blocked: the session still works, it just will not be remembered.
    }
  }
  if ('known' in next) {
    // Written a beat later: a screen of results arrives as several updates.
    clearTimeout(knownTimer);
    knownTimer = setTimeout(() => {
      try {
        localStorage.setItem(KNOWN_KEY, JSON.stringify(pruneKnown(state)));
      } catch {
        // As above.
      }
    }, 500);
  }
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

/**
 * When wallpaper `id` is on the desktop, the start of its loop, so a preview can play in step
 * with it. With "Per display" it may be on several displays; they share nothing, so the first
 * one wins.
 */
export function liveSince(s: AppState, id: WallpaperId): number | undefined {
  const c = s.current;
  if (!c) return undefined;
  return c.displays.find((d) => d.wallpaperId === id)?.startedAtMs ?? (c.id === id ? c.startedAtMs : undefined);
}

// ---- actions ----

export function go(view: View): void {
  setState({ view });
}

export function openDetail(id: WallpaperId): void {
  const { view } = state;
  go({ name: 'detail', id, back: view.name === 'detail' ? view.back : view });
}

export function openSettings(section: Section = 'General'): void {
  const { view } = state;
  go({ name: 'settings', section, back: view.name === 'settings' ? view.back : view });
}

export function back(): void {
  const { view } = state;
  go(view.name === 'detail' || view.name === 'settings' ? view.back : { name: 'home' });
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, tone: 'ok' | 'info' = 'ok'): void {
  clearTimeout(toastTimer);
  setState({ toast: { id: ++toastSeq, text, tone } });
  toastTimer = setTimeout(() => setState({ toast: null }), 2600);
}

/** Keep these wallpapers in `known` (a provider just returned them). */
export function remember(ws: readonly Wallpaper[]): void {
  const fresh = ws.filter((w) => state.known[w.id] !== w);
  if (!fresh.length) return;
  setState((s) => {
    const known = { ...s.known };
    // Re-inserted, so the order of keys is the order last seen (pruning keeps the newest).
    for (const w of fresh) {
      delete known[w.id];
      known[w.id] = w;
    }
    return { known };
  });
}

export function toggleFav(id: WallpaperId): void {
  setState((s) => ({ favs: s.favs.includes(id) ? s.favs.filter((x) => x !== id) : [id, ...s.favs] }));
}

export function updateSettings(patch: Partial<DesktopSettings>): void {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export function showUpgrade(feature: ProFeature | null = null): void {
  setState({ upgrade: { open: true, feature } });
}

export function setPlan(plan: PlanState): void {
  setState((s) => ({
    account: { ...s.account, plan },
    // A lapsed plan must not leave Pro-only settings in force.
    settings: clampToPlan(s.settings, DEFAULT_DESKTOP_SETTINGS, plan.plan),
  }));
}
