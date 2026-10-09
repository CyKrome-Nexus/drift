// Everything that touches Tauri goes through here, with a browser fallback, so the UI also runs
// under plain `vite` for quick design work.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

export const inTauri = isTauri();

export async function openExternal(url: string): Promise<void> {
  if (inTauri) await openUrl(url);
  else window.open(url, '_blank', 'noopener');
}

export const windowControls = {
  close: () => (inTauri ? getCurrentWindow().close() : Promise.resolve()),
  minimize: () => (inTauri ? getCurrentWindow().minimize() : Promise.resolve()),
};

export interface SystemInfo {
  os: string;
  arch: string;
  family: string;
  tauri: string;
  /** Whether this system has a working wallpaper engine. */
  engine: boolean;
}

export async function systemInfo(): Promise<SystemInfo> {
  if (inTauri) return invoke<SystemInfo>('system_info');
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? 'macos' : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'unknown';
  return { os, arch: 'browser', family: 'browser', tauri: '—', engine: false };
}

export function platformLabel(os: string): string {
  return { macos: 'macOS', windows: 'Windows', linux: 'Linux' }[os] ?? 'Browser preview';
}

export interface ApplyRequest {
  wallpaperId: number;
  target: string;
  displays: string;
  fps: string;
  muted: boolean;
  /** "Per display" only: the display that gets this wallpaper (an id from `listDisplays`); none means all. */
  display?: string | null;
}

export interface ApplyOutcome {
  live: boolean;
  note: string | null;
}

export async function applyWallpaper(request: ApplyRequest): Promise<ApplyOutcome> {
  if (!inTauri) return { live: false, note: 'Browser preview — run the desktop app to apply' };
  return invoke<ApplyOutcome>('apply_wallpaper', { request });
}

/** Apply the OS-level General settings. Login items are left alone in dev builds. */
export async function syncSystemSettings({ launchAtLogin, showInTray }: { launchAtLogin: boolean; showInTray: boolean }): Promise<void> {
  if (!inTauri) return;
  await invoke('set_tray_visible', { visible: showInTray });
  if (import.meta.env.DEV) return;
  const autostart = await import('@tauri-apps/plugin-autostart');
  if ((await autostart.isEnabled()) !== launchAtLogin) await (launchAtLogin ? autostart.enable() : autostart.disable());
}

export async function stopWallpaper(): Promise<void> {
  if (inTauri) await invoke('stop_wallpaper');
}

/** One display's wallpaper and its own loop clock. */
export interface Assignment {
  display: string;
  wallpaperId: number;
  startedAtMs: number;
}

/**
 * What the engine is showing, and when its loop started (epoch ms) — the shared playback clock.
 * With "Per display" each display has its own wallpaper and clock in `assignments`; the
 * top-level fields are the one applied last.
 */
export interface Running extends ApplyRequest {
  startedAtMs: number;
  assignments: Assignment[];
  /** Why playback is paused (battery, a fullscreen app, a busy CPU), or null while it plays. */
  paused: string | null;
}

/** A connected display, in physical pixels. Main display first. */
export interface Display {
  id: string;
  name: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** "Main" for the main display, "Display 2", "Display 3"… for the rest, in the engine's order. */
export function displayLabel(d: Display, index: number): string {
  return d.primary ? 'Main' : `Display ${index + 1}`;
}

export async function listDisplays(): Promise<Display[]> {
  return inTauri ? invoke<Display[]>('list_displays') : [];
}

/** Playback settings the engine applies to running wallpapers straight away. */
export interface Playback {
  fps: string;
  quality: string;
  pauseOnBattery: boolean;
  pauseFullscreen: boolean;
  pauseHighCpu: boolean;
}

export async function setPlayback(playback: Playback): Promise<void> {
  if (inTauri) await invoke('set_playback', { playback });
}

/** Set the lock screen to a still PNG. Windows only; elsewhere the engine says why it can't. */
export async function setLockScreen(png: Uint8Array): Promise<void> {
  if (!inTauri) throw new Error('Browser preview — run the desktop app to set the lock screen');
  await invoke('set_lock_screen', png);
}

export async function currentWallpaper(): Promise<Running | null> {
  return inTauri ? invoke<Running | null>('current_wallpaper') : null;
}

/** The engine reports every change here, including "Remove wallpaper" from the tray. */
export function onWallpaperChanged(cb: (running: Running | null) => void): () => void {
  if (!inTauri) return () => {};
  const off = listen<Running | null>('wallpaper-changed', (e) => cb(e.payload));
  return () => void off.then((f) => f());
}
