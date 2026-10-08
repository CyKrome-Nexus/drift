// "New from followed creators".
//
// Each check compares the catalog with the wallpaper ids seen at the last check and notifies
// about new ones from creators the user follows. The first check only records what exists, so
// turning this on never floods the phone with the back catalog. Checks run when the app starts
// or comes back to the foreground; a server push for when Drift is closed needs the real catalog
// and a push endpoint (see TODO.md).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { catalog, type Wallpaper } from '@drift/core';
import { getState } from './store';

const SEEN_KEY = 'drift.mobile.seen.v1';
const CHANNEL = 'followed-creators';
/** Past this many, one summary instead of a notification each. */
const MAX_SINGLE = 3;

/** Wallpapers that are new since `seen` and by a followed creator. `seen === null` is the first check. */
export function newFromFollowed(all: readonly Wallpaper[], following: readonly string[], seen: ReadonlySet<number> | null): Wallpaper[] {
  if (!seen) return [];
  return all.filter((w) => !seen.has(w.id) && following.includes(w.publisher));
}

async function loadSeen(): Promise<Set<number> | null> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) ? new Set(ids.filter((n): n is number => typeof n === 'number')) : null;
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
  const all = catalog();
  const seen = await loadSeen();
  const { following, settings } = getState();
  const fresh = settings.notifyFollowed ? newFromFollowed(all, following, seen) : [];
  // Everything in the catalog now counts as seen, notified or not: following a creator later
  // should not announce their old wallpapers as new.
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(all.map((w) => w.id))).catch(() => {});
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
export function wallpaperFromResponse(response: Notifications.NotificationResponse | null): number | null {
  const id = response?.notification.request.content.data?.wallpaperId;
  return typeof id === 'number' ? id : null;
}
