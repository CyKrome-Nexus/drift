// Setting the phone's wallpaper.
//
// NOT IMPLEMENTED YET, and the two platforms differ fundamentally:
// - Android allows live wallpapers: Drift needs a native `WallpaperService` (an Expo module
//   plus a config plugin that registers it in the manifest), and the user confirms it in the
//   system picker.
// - iOS has no API for an app to set the wallpaper at all. The best Drift can do is save the
//   loop as a Live Photo and walk the user through Settings › Wallpaper.
//
// Until then this reports honestly that nothing was applied.

import { Platform } from 'react-native';
import type { Wallpaper } from '@drift/core';
import { requirePro } from './account';
import { getState, toast } from './store';

export function applyWallpaper(w: Wallpaper): void {
  if (!requirePro.wallpaper(w)) return;
  const target = getState().settings.applyTarget;
  const where = target === 'Both' ? 'home & lock screen' : `${target.toLowerCase()} screen`;
  const pending = Platform.OS === 'ios' ? 'Live Photo export not built yet' : 'live wallpaper service not built yet';
  toast(`“${w.name}” for ${where} · ${pending}`, 'info');
}

export function downloadWallpaper(w: Wallpaper): void {
  if (!requirePro.wallpaper(w)) return;
  toast(`“${w.name}” · ${w.phoneSizeMb} MB — downloads arrive with the wallpaper catalog`, 'info');
}
