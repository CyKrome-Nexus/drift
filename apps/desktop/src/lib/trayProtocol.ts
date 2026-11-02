// What the main window and the tray popover say to each other. The popover only draws: the main
// window sends it a snapshot whenever something it shows changes, and runs what it asks for.

import type { DesktopSettings, Wallpaper, WallpaperId } from '@drift/core';
import type { QueueSource, Section } from './store';

/** Main → tray, on every change. */
export const STATE_EVENT = 'tray-state';
/** Tray → main: send me a snapshot (the popover just loaded). */
export const READY_EVENT = 'tray-ready';
/** Tray → main: do this. */
export const COMMAND_EVENT = 'tray-command';
/** Rust → tray: the popover was shown (true) or hidden (false). */
export const VISIBILITY_EVENT = 'tray-visibility';

export interface TrayItem {
  wallpaper: Wallpaper;
  /** Pro wallpaper on a free plan. */
  locked: boolean;
  /** On the desktop now. */
  current: boolean;
}

export interface TrayList {
  source: QueueSource;
  name: string;
  count: number;
  /** Previous / next walk this one. */
  playing: boolean;
}

export interface TraySnapshot {
  version: string;
  /** What the desktop shows (the wallpaper applied last), or null with nothing applied. */
  now: { wallpaper: Wallpaper; startedAtMs: number; paused: string | null; held: boolean } | null;
  /** What previous / next walk, and how many they can step onto. */
  queue: { label: string; size: number };
  shuffle: boolean;
  fps: DesktopSettings['fps'];
  quality: DesktopSettings['quality'];
  pro: boolean;
  recents: TrayItem[];
  lists: TrayList[];
  launchAtLogin: boolean;
  /** "Reduce CPU/RAM" is on. */
  saving: boolean;
}

export type TrayCommand =
  | { type: 'restart' | 'previous' | 'next' | 'pause' | 'shuffle' | 'remove' | 'saver' | 'launchAtLogin' | 'upgrade' }
  | { type: 'open'; section?: Section }
  | { type: 'apply'; id: WallpaperId }
  | { type: 'play'; source: QueueSource }
  | { type: 'fps'; value: DesktopSettings['fps'] }
  | { type: 'quality'; value: DesktopSettings['quality'] };
