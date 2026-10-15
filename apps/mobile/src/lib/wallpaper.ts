// Setting the phone's wallpaper. The two platforms differ fundamentally:
// - Android allows live wallpapers. Drift's `WallpaperService` (modules/drift-wallpaper) plays
//   the wallpaper natively — a provider's video, downloaded once, or the generated art — and the
//   first time, the user confirms it in the system preview; after that picking another
//   wallpaper swaps it in place.
// - iOS has no API for an app to set the wallpaper at all. Drift saves the loop as a Live Photo
//   (three seconds of the video, or of the generated art), then opens Photos, where the user
//   picks it and taps Share › Use as Wallpaper. If Photos will not open, an in-app guide walks
//   them through Settings › Wallpaper instead.
//   Experiment (Settings › iPhone wallpaper): with the user's "Drift Wallpaper" Apple Shortcut
//   installed, Drift runs it instead and the wallpaper changes with no further taps.
// Expo Go has neither native module, so there it says what is missing instead.

import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { art, pickFile, type MobileSettings, type Wallpaper } from '@drift/core';
import DriftWallpaper from '../../modules/drift-wallpaper';
import { requirePro } from './account';
import { catalog, resolve } from './catalog';
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

/**
 * The file a phone plays: Android loops it all day, so a light one; iOS cuts three seconds into
 * a Live Photo the size of the screen, so the sharpest there is.
 */
export function phoneFile(w: Wallpaper, os: string = Platform.OS): string | null {
  if (!w.media) return null;
  return pickFile(w.media.files, os === 'ios' ? 2160 : 1080)?.url ?? w.media.preview;
}

/**
 * The wallpaper as the native renderers read it (`WallpaperSpec` in Kotlin and Swift). A
 * provider's wallpaper sends its video (and poster); generated art sends its layers, which the
 * native side paints. The tint layers go either way, for while a video loads.
 */
export function nativeSpec(w: Wallpaper, settings: MobileSettings) {
  const { layers, base } = art(w, 'portrait');
  return {
    id: w.id,
    name: w.name,
    video: phoneFile(w),
    poster: w.media?.poster ?? null,
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

export async function applyWallpaper(shown: Wallpaper): Promise<void> {
  if (!requirePro.wallpaper(shown)) return;
  if (getState().applying !== null) return;

  if (!DriftWallpaper) {
    toast('Setting wallpapers needs the Drift app build — Expo Go can’t', 'info');
    return;
  }

  setState({ applying: shown.id });
  try {
    // Lists can carry only a preview's files; the native side gets the full set.
    const w = await resolve(shown);
    const { settings } = getState();
    const spec = JSON.stringify(nativeSpec(w, settings));
    if (w.media) toast(`Downloading “${w.name}”…`, 'info');
    if (Platform.OS === 'android' && DriftWallpaper.setLiveWallpaper) {
      const result = await DriftWallpaper.setLiveWallpaper(spec);
      if (result === 'applied') toast(`“${w.name}” is now your wallpaper`);
      // The system preview is opening; home/lock is chosen there.
      else toast(`Tap “Set wallpaper” and choose ${targetLabel(settings.applyTarget)}`, 'info');
      void catalog.used(w);
    } else if (Platform.OS === 'ios' && DriftWallpaper.saveLivePhoto) {
      toast(`Saving “${w.name}” as a Live Photo…`, 'info');
      await DriftWallpaper.saveLivePhoto(spec);
      void catalog.used(w);
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
    router.push(`/live-photo?id=${encodeURIComponent(w.id)}`);
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

/** Opens the wallpaper's file, where the system offers to save it. Generated art has none. */
export async function downloadWallpaper(shown: Wallpaper): Promise<void> {
  if (!requirePro.wallpaper(shown)) return;
  if (!shown.media) {
    toast(`“${shown.name}” is generated by Drift as it plays — there is no file to save`, 'info');
    return;
  }
  const w = await resolve(shown);
  const url = pickFile(w.media!.files, 2160)?.url;
  if (!url) {
    toast(`“${w.name}” has no file to save`, 'info');
    return;
  }
  try {
    await Linking.openURL(url);
    void catalog.used(w);
  } catch (e) {
    failed(e);
  }
}
