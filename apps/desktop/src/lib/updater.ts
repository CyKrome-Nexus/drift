// Self-update, after Aperture's updater: every entry point is non-throwing, failures land in
// `error`, and a check the user asked for always shows its outcome.

import { useSyncExternalStore } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { APP_VERSION, inTauri } from './platform';

export type UpdatePhase = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdaterState {
  phase: UpdatePhase;
  currentVersion: string;
  newVersion: string;
  notes: string;
  received: number;
  total: number;
  error: string;
}

let state: UpdaterState = {
  phase: 'idle',
  currentVersion: APP_VERSION,
  newVersion: '',
  notes: '',
  received: 0,
  total: 0,
  error: '',
};
const listeners = new Set<() => void>();
let pending: Update | null = null;
let inFlight: Promise<void> | null = null;

const CHECK_TIMEOUT_MS = 20_000;

function set(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useUpdater(): UpdaterState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Always logged. Shown in the UI only when the user asked; a failed background check stays quiet. */
function fail(where: string, err: unknown, show = true) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[updater] ${where} failed: ${message}`);
  set(show ? { phase: 'error', error: message } : { phase: 'idle' });
}

/** `manual`: the user clicked "Check now", so the outcome is shown even when it is a failure. */
export function checkForUpdates(manual = true): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!inTauri) {
      if (manual) set({ phase: 'error', error: 'Updates are available in the desktop app only.' });
      return;
    }
    set({ phase: 'checking', error: '' });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: CHECK_TIMEOUT_MS });
      pending = update;
      if (update) set({ phase: 'available', newVersion: update.version, notes: update.body ?? '' });
      else set({ phase: 'uptodate' });
    } catch (err) {
      fail('check', err, manual);
    }
  })().finally(() => (inFlight = null));
  return inFlight;
}

export async function downloadAndInstall(): Promise<void> {
  if (!pending) return;
  set({ phase: 'downloading', received: 0, total: 0 });
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === 'Started') set({ total: e.data.contentLength ?? 0 });
      else if (e.event === 'Progress') set({ received: state.received + e.data.chunkLength });
    });
    set({ phase: 'ready' });
  } catch (err) {
    fail('install', err);
  }
}

export async function restart(): Promise<void> {
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    fail('restart', err);
  }
}
