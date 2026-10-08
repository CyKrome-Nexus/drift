// Setting the phone's wallpaper. The two platforms differ fundamentally:
// - Android allows live wallpapers. Drift's `WallpaperService` (modules/drift-wallpaper) plays
//   the art natively; the first time, the user confirms it in the system preview, after that
//   picking another wallpaper swaps it in place.
// - iOS has no API for an app to set the wallpaper at all. Drift saves the loop as a Live Photo,
//   then opens Photos, where the user picks it and taps Share › Use as Wallpaper. If Photos will
//   not open, an in-app guide walks them through Settings › Wallpaper instead.
//   Experiment (Settings › iPhone wallpaper): with the user's "Drift Wallpaper" Apple Shortcut
//   installed, Drift runs it instead and the wallpaper changes with no further taps.
// Expo Go has neither native module, so there it says what is missing instead.

import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { art, type MobileSettings, type Wallpaper } from '@drift/core';
import DriftWallpaper from '../../modules/drift-wallpaper';
import { requirePro } from './account';
import { DRIFT_MS, OVERSCAN_X, OVERSCAN_Y } from './motion';
import { getState, setState, toast } from './store';

/**
 * Photos' own URL scheme. Undocumented (Apple publishes no link into Photos or the wallpaper
 * settings) but long-standing; it opens the library with the newest photo at the end.
 */
export const PHOTOS_URL = 'photos-redirect://';
/** How long the hint shows before Drift hands over to Photos. */
export const PHOTOS_HINT_MS = 1800;
/** The Apple Shortcut the user adds once (see the setup screen). The name is the contract. */
export const SHORTCUT_NAME = 'Drift Wallpaper';
/** Apple's documented URL for running a shortcut by name. */
export const SHORTCUT_RUN_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;

/** The wallpaper as the native renderers read it (`WallpaperSpec` in Kotlin and Swift). */
export function nativeSpec(w: Wallpaper, settings: MobileSettings) {
  const { layers, base } = art(w, 'portrait');
  return {
    id: w.id,
    name: w.name,
    base,
    layers,
    overscanX: OVERSCAN_X,
    overscanY: OVERSCAN_Y,
    driftMs: DRIFT_MS,
    fps: Number(settings.fps),
    pauseLowPower: settings.pauseLowPower,
  };
}

export function targetLabel(target: MobileSettings['applyTarget']): string {
  return target === 'Both' ? 'home & lock screen' : `${target.toLowerCase()} screen`;
}

function failed(e: unknown): void {
  const reason = e instanceof Error ? e.message : String(e);
  toast(`Couldn’t set the wallpaper · ${reason}`, 'info');
}

export async function applyWallpaper(w: Wallpaper): Promise<void> {
  if (!requirePro.wallpaper(w)) return;
  if (getState().applying !== null) return;
  const { settings } = getState();
  const spec = JSON.stringify(nativeSpec(w, settings));

  if (!DriftWallpaper) {
    toast('Setting wallpapers needs the Drift app build — Expo Go can’t', 'info');
    return;
  }

  setState({ applying: w.id });
  try {
    if (Platform.OS === 'android' && DriftWallpaper.setLiveWallpaper) {
      const result = await DriftWallpaper.setLiveWallpaper(spec);
      if (result === 'applied') toast(`“${w.name}” is now your wallpaper`);
      // The system preview is opening; home/lock is chosen there.
      else toast(`Tap “Set wallpaper” and choose ${targetLabel(settings.applyTarget)}`, 'info');
    } else if (Platform.OS === 'ios' && DriftWallpaper.saveLivePhoto) {
      toast(`Saving “${w.name}” as a Live Photo…`, 'info');
      await DriftWallpaper.saveLivePhoto(spec);
      if (getState().iosShortcut) await runShortcut(w);
      else await handOffToPhotos(w);
    }
  } catch (e) {
    failed(e);
  } finally {
    setState({ applying: null });
  }
}

/** Last step on iOS: the user's. Say what to tap, then open Photos; the guide if it won't open. */
async function handOffToPhotos(w: Wallpaper): Promise<void> {
  toast('Saved · in Photos, tap the newest photo › Share › Use as Wallpaper', 'info');
  await new Promise((r) => setTimeout(r, PHOTOS_HINT_MS));
  try {
    await Linking.openURL(PHOTOS_URL);
  } catch {
    router.push(`/live-photo?id=${w.id}`);
  }
}

/** The experiment: the shortcut takes the newest photo, sets it and comes back to Drift. */
async function runShortcut(w: Wallpaper): Promise<void> {
  toast(`Setting “${w.name}” with Shortcuts…`, 'info');
  try {
    await Linking.openURL(SHORTCUT_RUN_URL);
  } catch {
    // Shortcuts removed from the phone: the ordinary path still works.
    await handOffToPhotos(w);
  }
}

export function downloadWallpaper(w: Wallpaper): void {
  if (!requirePro.wallpaper(w)) return;
  toast(`“${w.name}” · ${w.phoneSizeMb} MB — downloads arrive with the wallpaper catalog`, 'info');
}
