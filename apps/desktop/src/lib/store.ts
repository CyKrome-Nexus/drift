// App state: one object, one subscribe, read through `useApp`. Small enough that a library would
// cost more than it saves.

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_DESKTOP_SETTINGS,
  clampToPlan,
  hydrate,
  type DesktopSettings,
  type ProFeature,
} from '@drift/core';
import { INITIAL_ACCOUNT, type AccountState, type PlanState } from '@drift/account';
import type { ApplyRequest } from './platform';

export type Section = 'General' | 'Playback' | 'Performance' | 'Displays' | 'Library & storage' | 'Account' | 'About';
export type BrowseTab = 'Discover' | 'Library' | 'Favourites';

export type View =
  | { name: 'home' }
  | { name: 'browse'; tab: BrowseTab }
  | { name: 'detail'; id: number; back: View }
  | { name: 'settings'; section: Section; back: View };

export interface WallpaperList {
  id: string;
  name: string;
  items: number[];
}

export interface UpdatePrefs {
  mode: 'auto' | 'notify' | 'manual';
  checkOnStartup: boolean;
}

export interface AppState {
  view: View;
  query: string;
  favs: number[];
  lists: WallpaperList[];
  /** Creators followed on the phone. Desktop has no follow UI yet; kept so sync preserves them. */
  following: string[];
  settings: DesktopSettings;
  updatePrefs: UpdatePrefs;
  toast: { id: number; text: string; tone: 'ok' | 'info' } | null;
  account: AccountState;
  upgrade: { open: boolean; feature: ProFeature | null };
  /** The wallpaper the engine is showing right now, and when its loop started. Set only from the engine. */
  current: { id: number; startedAtMs: number } | null;
  /** The last wallpaper applied, kept across launches for "Resume last wallpaper on startup". */
  lastApplied: ApplyRequest | null;
}

const STORAGE_KEY = 'drift.desktop.v1';

interface Persisted {
  favs: number[];
  lists: WallpaperList[];
  following: string[];
  settings: DesktopSettings;
  updatePrefs: UpdatePrefs;
  lastApplied: ApplyRequest | null;
}

const DEFAULT_UPDATE_PREFS: UpdatePrefs = { mode: 'notify', checkOnStartup: true };

function load(): Persisted {
  let raw: Partial<Persisted> = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // Unreadable storage is a fresh install, not an error.
  }
  return {
    favs: Array.isArray(raw.favs) ? raw.favs.filter((n) => typeof n === 'number') : [6, 14],
    lists: Array.isArray(raw.lists) ? raw.lists : [{ id: 'workspace', name: 'Workspace', items: [6] }],
    following: Array.isArray(raw.following) ? raw.following.filter((p) => typeof p === 'string') : [],
    settings: hydrate(raw.settings, DEFAULT_DESKTOP_SETTINGS),
    updatePrefs: hydrate(raw.updatePrefs, DEFAULT_UPDATE_PREFS),
    lastApplied: raw.lastApplied && typeof raw.lastApplied.wallpaperId === 'number' ? raw.lastApplied : null,
  };
}

const persisted = load();

let state: AppState = {
  view: { name: 'home' },
  query: '',
  ...persisted,
  toast: null,
  account: INITIAL_ACCOUNT,
  upgrade: { open: false, feature: null },
  current: null,
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if ('favs' in next || 'lists' in next || 'following' in next || 'settings' in next || 'updatePrefs' in next || 'lastApplied' in next) {
    try {
      const { favs, lists, following, settings, updatePrefs, lastApplied } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ favs, lists, following, settings, updatePrefs, lastApplied } satisfies Persisted));
    } catch {
      // Storage full or blocked: the session still works, it just will not be remembered.
    }
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

// ---- actions ----

export function go(view: View): void {
  setState({ view });
}

export function openDetail(id: number): void {
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

export function toggleFav(id: number): void {
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
