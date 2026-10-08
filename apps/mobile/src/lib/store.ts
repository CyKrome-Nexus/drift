// App state for the phone: one object, one subscribe, read through `useApp`. Same shape and
// rules as the desktop store, with the phone's settings.

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MOBILE_SETTINGS, clampToPlan, hydrate, type MobileSettings, type ProFeature } from '@drift/core';
import { FREE_PLAN, type CyKromeUser, type PlanState } from '@drift/account';

export interface WallpaperList {
  id: string;
  name: string;
  items: number[];
}

export interface AppState {
  ready: boolean;
  favs: number[];
  lists: WallpaperList[];
  /** Creators (publisher names) the user follows. Kept on the phone until accounts sync. */
  following: string[];
  settings: MobileSettings;
  toast: { id: number; text: string; tone: 'ok' | 'info' } | null;
  account: { status: 'restoring' | 'signedOut' | 'signedIn'; user: CyKromeUser | null; plan: PlanState; planError: string | null };
  upgradeFeature: ProFeature | null;
  /** The wallpaper being set right now, so a second tap does not start another. */
  applying: number | null;
}

const STORAGE_KEY = 'drift.mobile.v1';

let state: AppState = {
  ready: false,
  favs: [6, 14],
  lists: [{ id: 'late-night', name: 'Late night', items: [] }],
  following: [],
  settings: DEFAULT_MOBILE_SETTINGS,
  toast: null,
  account: { status: 'restoring', user: null, plan: FREE_PLAN, planError: null },
  upgradeFeature: null,
  applying: null,
};

const listeners = new Set<() => void>();

function persist() {
  const { favs, lists, following, settings } = state;
  // Fire and forget: a failed write costs remembering this change, nothing else.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ favs, lists, following, settings })).catch(() => {});
}

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if ('favs' in next || 'lists' in next || 'following' in next || 'settings' in next) persist();
  listeners.forEach((l) => l());
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

export async function loadPersisted(): Promise<void> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}');
  } catch {
    // Unreadable storage is a fresh install.
  }
  setState({
    ready: true,
    ...(Array.isArray(raw.favs) ? { favs: raw.favs.filter((n): n is number => typeof n === 'number') } : {}),
    ...(Array.isArray(raw.lists) ? { lists: raw.lists as WallpaperList[] } : {}),
    ...(Array.isArray(raw.following) ? { following: raw.following.filter((n): n is string => typeof n === 'string') } : {}),
    settings: hydrate(raw.settings, DEFAULT_MOBILE_SETTINGS),
  });
}

// ---- actions ----

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

export function toggleFollow(publisher: string): void {
  setState((s) => ({ following: s.following.includes(publisher) ? s.following.filter((p) => p !== publisher) : [...s.following, publisher] }));
}

export function updateSettings(patch: Partial<MobileSettings>): void {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export function setPlan(plan: PlanState): void {
  setState((s) => ({
    account: { ...s.account, plan, planError: null },
    settings: clampToPlan(s.settings, DEFAULT_MOBILE_SETTINGS, plan.plan),
  }));
}
