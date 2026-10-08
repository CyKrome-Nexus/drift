// Setting the phone's wallpaper. The two platforms differ fundamentally:
// - Android allows live wallpapers. Drift's `WallpaperService` (modules/drift-wallpaper) plays
//   the art natively; the first time, the user confirms it in the system preview, after that
//   picking another wallpaper swaps it in place.
// - iOS has no API for an app to set the wallpaper at all. Drift saves the loop as a Live Photo
//   and walks the user through Settings › Wallpaper.
// Expo Go has neither native module, so there it says what is missing instead.

import { Platform } from 'react-native';
import { router } from 'expo-router';
import { art, type MobileSettings, type Wallpaper } from '@drift/core';
import DriftWallpaper from '../../modules/drift-wallpaper';
import { requirePro } from './account';
import { DRIFT_MS, OVERSCAN_X, OVERSCAN_Y } from './motion';
import { getState, setState, toast } from './store';

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
      router.push(`/live-photo?id=${w.id}`);
    }
  } catch (e) {
    failed(e);
  } finally {
    setState({ applying: null });
  }
}

export function downloadWallpaper(w: Wallpaper): void {
  if (!requirePro.wallpaper(w)) return;
  toast(`“${w.name}” · ${w.phoneSizeMb} MB — downloads arrive with the wallpaper catalog`, 'info');
}
