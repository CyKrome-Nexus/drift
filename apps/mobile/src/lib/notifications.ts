// "New from followed creators".
//
// Each check compares what is trending across the providers with the wallpaper ids seen at the
// last check and notifies about new ones from creators the user follows. The first check only records what exists, so
// turning this on never floods the phone with the back catalog. Checks run when the app starts
// or comes back to the foreground; a server push for when Drift is closed needs the real catalog
// and a push endpoint (see TODO.md).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Wallpaper, WallpaperId } from '@drift/core';
import { catalog } from './catalog';
import { getState } from './store';

const SEEN_KEY = 'drift.mobile.seen.v1';
const CHANNEL = 'followed-creators';
/** Past this many, one summary instead of a notification each. */
const MAX_SINGLE = 3;

/** Wallpapers that are new since `seen` and by a followed creator. `seen === null` is the first check. */
export function newFromFollowed(all: readonly Wallpaper[], following: readonly string[], seen: ReadonlySet<WallpaperId> | null): Wallpaper[] {
  if (!seen) return [];
  return all.filter((w) => !seen.has(w.id) && following.includes(w.publisher));
}

async function loadSeen(): Promise<Set<WallpaperId> | null> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : null;
    // Numbers are from before providers: treat that list as a first check.
    return Array.isArray(ids) && ids.every((n) => typeof n === 'string') ? new Set(ids as WallpaperId[]) : null;
  } catch {
    return null;
  }
}

/** Asks for permission (once the user turns the setting on). Returns whether Drift may notify. */
export async function enableNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'New from followed creators',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Runs one check. Returns how many new wallpapers it notified about. */
export async function checkFollowedCreators(): Promise<number> {
  let all: Wallpaper[];
  try {
    all = (await catalog.feed({ kind: 'trending' })).items;
  } catch {
    return 0; // Offline: nothing to compare, nothing recorded.
  }
  const seen = await loadSeen();
  const { following, settings } = getState();
  const fresh = settings.notifyFollowed ? newFromFollowed(all, following, seen) : [];
  // Everything seen now counts as seen, notified or not: following a creator later should not
  // announce their old wallpapers as new. Earlier ids stay, so a wallpaper that leaves the feed
  // and returns is not news either.
  const remembered = [...new Set([...all.map((w) => w.id), ...(seen ?? [])])].slice(0, 2000);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(remembered)).catch(() => {});
  if (fresh.length === 0 || !(await Notifications.getPermissionsAsync()).granted) return 0;

  const notes = fresh.length > MAX_SINGLE
    ? [{ title: `${fresh.length} new wallpapers from creators you follow`, body: fresh.map((w) => w.name).join(', '), data: {} }]
    : fresh.map((w) => ({ title: `New from ${w.publisher}`, body: `${w.name} · ${w.category}`, data: { wallpaperId: w.id } }));
  for (const content of notes) {
    await Notifications.scheduleNotificationAsync({ content, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
  }
  return fresh.length;
}

/** The wallpaper a tapped notification points at, if any. */
export function wallpaperFromResponse(response: Notifications.NotificationResponse | null): WallpaperId | null {
  const id = response?.notification.request.content.data?.wallpaperId;
  return typeof id === 'string' ? id : typeof id === 'number' ? `drift:${id}` : null;
}
