// Previous / next / shuffle for the tray: walking a list of wallpapers on the desktop.
//
// The queue is the list the tray last played (Favourites or one of the lists). Until one is
// played it is Favourites, and with no favourites it is the recently shown wallpapers. Only
// wallpapers this device knows and the plan allows are stepped onto.

import { canApply, type Wallpaper, type WallpaperId } from '@drift/core';
import { apply, request } from './actions';
import { applyWallpaper, setPaused } from './platform';
import { getState, setState, type AppState, type QueueSource } from './store';

export interface Queue {
  /** What the tray calls it. */
  label: string;
  /** Null while falling back to recents. */
  source: QueueSource | null;
  ids: WallpaperId[];
}

export function sourceItems(s: AppState, source: QueueSource): { name: string; ids: WallpaperId[] } | null {
  if (source === 'favs') return { name: 'Favourites', ids: s.favs };
  const list = s.lists.find((l) => `list:${l.id}` === source);
  return list ? { name: list.name, ids: list.items } : null;
}

/** The wallpapers previous / next step through, playable ones only. */
export function queueOf(s: AppState): Queue {
  const playable = (ids: WallpaperId[]) => ids.filter((id) => s.known[id] && canApply(s.account.plan.plan, s.known[id].tier));
  const chosen = s.queue && sourceItems(s, s.queue);
  if (chosen && playable(chosen.ids).length) return { label: chosen.name, source: s.queue, ids: playable(chosen.ids) };
  if (playable(s.favs).length) return { label: 'Favourites', source: 'favs', ids: playable(s.favs) };
  return { label: 'Recents', source: null, ids: playable(s.recents) };
}

/**
 * The wallpaper `dir` steps away from `current` in `ids`, wrapping at the ends. Shuffle picks any
 * other one at random. Null when there is nowhere to go.
 */
export function step(ids: readonly WallpaperId[], current: WallpaperId | null, dir: 1 | -1, shuffle: boolean, random = Math.random): WallpaperId | null {
  const others = ids.filter((id) => id !== current);
  if (!others.length) return null;
  if (shuffle) return others[Math.floor(random() * others.length)];
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(i + dir + ids.length) % ids.length];
}

function known(id: WallpaperId | null): Wallpaper | null {
  return id ? (getState().known[id] ?? null) : null;
}

/** On the desktop only: the lock screen does not follow a playlist. */
async function show(w: Wallpaper | null): Promise<void> {
  if (w) await apply(w, 'Desktop');
}

export async function next(): Promise<void> {
  const s = getState();
  await show(known(step(queueOf(s).ids, s.current?.id ?? null, 1, s.shuffle)));
}

/** With shuffle on, back to what played before, as a music player does. */
export async function previous(): Promise<void> {
  const s = getState();
  const current = s.current?.id ?? null;
  if (s.shuffle) {
    const before = s.recents.find((id) => id !== current && known(id) && canApply(s.account.plan.plan, known(id)!.tier));
    if (before) return show(known(before));
  }
  await show(known(step(queueOf(s).ids, current, -1, false)));
}

/** Start the list from its top (anywhere in it, with shuffle). */
export async function play(source: QueueSource): Promise<void> {
  setState({ queue: source });
  const s = getState();
  const { ids } = queueOf(s);
  await show(known(s.shuffle ? step(ids, s.current?.id ?? null, 1, true) : ids[0] ?? null));
}

/** Start every loop on the desktop over from the top. Each display keeps its own wallpaper. */
export async function restart(): Promise<void> {
  const { current, settings } = getState();
  if (!current) return;
  if (settings.monitors === 'Per display') {
    for (const d of current.displays) {
      const w = known(d.wallpaperId);
      if (w) await applyWallpaper(request(w, 'Desktop', d.display)).catch(() => null);
    }
    return;
  }
  const w = known(current.id);
  if (w) await applyWallpaper(request(w, 'Desktop')).catch(() => null);
}

export async function togglePause(): Promise<void> {
  const { current } = getState();
  if (current) await setPaused(!current.held);
}

export function toggleShuffle(): void {
  setState((s) => ({ shuffle: !s.shuffle }));
}

/** Whether "Reduce CPU/RAM" is in force: on, and nobody has changed the frame rate or quality since. */
export function saving(s: AppState): boolean {
  return s.saver !== null && s.settings.fps === '30' && s.settings.quality === 'Low';
}

/** "Reduce CPU/RAM": 30 fps at Low quality, and back to what it was when turned off. */
export function toggleSaver(): void {
  setState((s) => {
    if (saving(s)) return { saver: null, settings: { ...s.settings, fps: s.saver!.fps, quality: s.saver!.quality } };
    return { saver: { fps: s.settings.fps, quality: s.settings.quality }, settings: { ...s.settings, fps: '30', quality: 'Low' } };
  });
}
