// App state for the phone: one object, one subscribe, read through `useApp`. Same shape and
// rules as the desktop store, with the phone's settings.

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_MOBILE_SETTINGS,
  clampToPlan,
  generatedWallpapers,
  hydrate,
  migrateIds,
  type MobileSettings,
  type ProFeature,
  type Wallpaper,
  type WallpaperId,
} from '@drift/core';
import { INITIAL_ACCOUNT, type AccountState, type PlanState } from '@drift/account';

export interface WallpaperList {
  id: string;
  name: string;
  items: WallpaperId[];
}

export interface AppState {
  ready: boolean;
  favs: WallpaperId[];
  lists: WallpaperList[];
  /**
   * Every wallpaper this phone has shown, by id: favourites, lists and notifications read it, so
   * they appear at once and work offline. Providers' answers refresh it.
   */
  known: Record<WallpaperId, Wallpaper>;
  /** Creators (publisher names) the user follows. Synced with the account for Drift Pro. */
  following: string[];
  /** iOS experiment: set wallpapers by running the "Drift Wallpaper" Apple Shortcut. */
  iosShortcut: boolean;
  settings: MobileSettings;
  toast: { id: number; text: string; tone: 'ok' | 'info' } | null;
  account: AccountState;
  upgradeFeature: ProFeature | null;
  /** The wallpaper being set right now, so a second tap does not start another. */
  applying: WallpaperId | null;
}

const STORAGE_KEY = 'drift.mobile.v1';
const KNOWN_KEY = 'drift.mobile.known.v1';
/** Beyond what the library holds, how many recently seen wallpapers to keep. */
const KNOWN_RECENT = 200;

const generatedKnown = (): Record<WallpaperId, Wallpaper> => Object.fromEntries(generatedWallpapers().map((w) => [w.id, w]));

let state: AppState = {
  ready: false,
  favs: [],
  lists: [{ id: 'late-night', name: 'Late night', items: [] }],
  known: generatedKnown(),
  following: [],
  iosShortcut: false,
  settings: DEFAULT_MOBILE_SETTINGS,
  toast: null,
  account: INITIAL_ACCOUNT,
  upgradeFeature: null,
  applying: null,
};

const listeners = new Set<() => void>();

function persist() {
  const { favs, lists, following, iosShortcut, settings } = state;
  // Fire and forget: a failed write costs remembering this change, nothing else.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ favs, lists, following, iosShortcut, settings })).catch(() => {});
}

export function getState(): AppState {
  return state;
}

/** What `known` keeps: everything in the library, then the most recently seen. */
function pruneKnown(s: AppState): Record<WallpaperId, Wallpaper> {
  const keep = new Set<WallpaperId>([...s.favs, ...s.lists.flatMap((l) => l.items)]);
  const recent = Object.keys(s.known).filter((id) => !keep.has(id)).slice(-KNOWN_RECENT);
  const out: Record<WallpaperId, Wallpaper> = {};
  // The generated set is rebuilt at launch, not stored.
  for (const id of [...keep, ...recent]) if (s.known[id] && !id.startsWith('drift:')) out[id] = s.known[id];
  return out;
}

let knownTimer: ReturnType<typeof setTimeout> | undefined;

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if ('favs' in next || 'lists' in next || 'following' in next || 'iosShortcut' in next || 'settings' in next) persist();
  if ('known' in next && state.ready) {
    // Written a beat later: a screen of results arrives as several updates.
    clearTimeout(knownTimer);
    knownTimer = setTimeout(() => AsyncStorage.setItem(KNOWN_KEY, JSON.stringify(pruneKnown(state))).catch(() => {}), 500);
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

async function readJson(key: string): Promise<Record<string, any>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key)) ?? '{}') ?? {};
  } catch {
    // Unreadable storage is a fresh install.
    return {};
  }
}

/** Saved state, with wallpaper ids from before providers (numbers) carried over. */
export async function loadPersisted(): Promise<void> {
  const [raw, rawKnown] = await Promise.all([readJson(STORAGE_KEY), readJson(KNOWN_KEY)]);
  const known = generatedKnown();
  for (const [id, w] of Object.entries(rawKnown)) if (w && typeof w === 'object' && w.id === id) known[id] = w as Wallpaper;
  setState((s) => ({
    ready: true,
    // Anything seen before storage was read stays.
    known: { ...known, ...s.known },
    ...(Array.isArray(raw.favs) ? { favs: migrateIds(raw.favs) } : {}),
    ...(Array.isArray(raw.lists)
      ? {
          lists: raw.lists
            .filter((l: any) => typeof l?.id === 'string' && typeof l?.name === 'string')
            .map((l: any) => ({ id: l.id, name: l.name, items: migrateIds(l.items) })),
        }
      : {}),
    ...(Array.isArray(raw.following) ? { following: raw.following.filter((n): n is string => typeof n === 'string') } : {}),
    ...(typeof raw.iosShortcut === 'boolean' ? { iosShortcut: raw.iosShortcut } : {}),
    settings: hydrate(raw.settings, DEFAULT_MOBILE_SETTINGS),
  }));
}

// ---- actions ----

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

export function toggleFollow(publisher: string): void {
  setState((s) => ({ following: s.following.includes(publisher) ? s.following.filter((p) => p !== publisher) : [...s.following, publisher] }));
}

export function updateSettings(patch: Partial<MobileSettings>): void {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export function setPlan(plan: PlanState): void {
  setState((s) => ({
    account: { ...s.account, plan },
    settings: clampToPlan(s.settings, DEFAULT_MOBILE_SETTINGS, plan.plan),
  }));
}
