// The main window's side of the tray popover: it sends the popover what to show and runs what
// the popover asks for. All the app's logic stays here, so the popover is only a view.

import { emitTo, listen } from '@tauri-apps/api/event';
import { canApply, isProOption, type Wallpaper } from '@drift/core';
import { requirePro } from './account';
import { apply, stop } from './actions';
import { APP_VERSION, inTauri, openMain } from './platform';
import { next, play, previous, queueOf, restart, saving, sourceItems, toggleSaver, togglePause, toggleShuffle } from './queue';
import { getState, openSettings, setState, showUpgrade, subscribe, updateSettings, type AppState, type QueueSource } from './store';
import { COMMAND_EVENT, READY_EVENT, STATE_EVENT, type TrayCommand, type TrayItem, type TraySnapshot } from './trayProtocol';

export function snapshot(s: AppState): TraySnapshot {
  const plan = s.account.plan.plan;
  const shown = new Set(s.current ? [s.current.id, ...s.current.displays.map((d) => d.wallpaperId)] : []);
  const item = (w: Wallpaper): TrayItem => ({ wallpaper: w, locked: !canApply(plan, w.tier), current: shown.has(w.id) });
  const nowWallpaper = s.current && s.known[s.current.id];
  const queue = queueOf(s);
  const sources: QueueSource[] = ['favs', ...s.lists.map((l) => `list:${l.id}` as const)];

  return {
    version: APP_VERSION,
    now: s.current && nowWallpaper ? { wallpaper: nowWallpaper, startedAtMs: s.current.startedAtMs, paused: s.current.paused, held: s.current.held } : null,
    queue: { label: queue.label, size: queue.ids.length },
    shuffle: s.shuffle,
    fps: s.settings.fps,
    quality: s.settings.quality,
    pro: plan === 'pro',
    recents: s.recents.flatMap((id) => (s.known[id] ? [item(s.known[id])] : [])),
    lists: sources.flatMap((source) => {
      const list = sourceItems(s, source);
      return list ? [{ source, name: list.name, count: list.ids.length, playing: queue.source === source }] : [];
    }),
    launchAtLogin: s.settings.launchAtLogin,
    saving: saving(s),
  };
}

/** Show the main window, then do something there (a screen, the upgrade sheet). */
async function reveal(then?: () => void): Promise<void> {
  then?.();
  await openMain();
}

export async function run(cmd: TrayCommand): Promise<void> {
  switch (cmd.type) {
    case 'restart':
      return restart();
    case 'previous':
      return previous();
    case 'next':
      return next();
    case 'pause':
      return togglePause();
    case 'shuffle':
      return toggleShuffle();
    case 'remove':
      return stop();
    case 'saver':
      return toggleSaver();
    case 'launchAtLogin':
      return updateSettings({ launchAtLogin: !getState().settings.launchAtLogin });
    case 'upgrade':
      return reveal(() => showUpgrade(null));
    case 'open':
      return reveal(() => cmd.section && openSettings(cmd.section));
    case 'play':
      return play(cmd.source);
    case 'apply': {
      const w = getState().known[cmd.id];
      if (!w) return;
      // A Pro wallpaper on a free plan opens the upgrade sheet, which needs the window.
      if (!canApply(getState().account.plan.plan, w.tier)) return reveal(() => showUpgrade('proWallpapers'));
      return apply(w, 'Desktop');
    }
    case 'fps':
      if (isProOption('fps', cmd.value) && !requirePro.feature('unlimitedFrameRate')) return reveal();
      // Picking a frame rate by hand ends "Reduce CPU/RAM".
      return setState((s) => ({ saver: null, settings: { ...s.settings, fps: cmd.value } }));
    case 'quality':
      return setState((s) => ({ saver: null, settings: { ...s.settings, quality: cmd.value } }));
  }
}

/** Keep the popover in step with the store and answer its commands. Returns a disconnect. */
export function connectTray(): () => void {
  if (!inTauri) return () => {};
  let last = '';
  const send = (force = false) => {
    const json = JSON.stringify(snapshot(getState()));
    if (json === last && !force) return;
    last = json;
    void emitTo('tray', STATE_EVENT, JSON.parse(json)).catch(() => {});
  };
  const unsubscribe = subscribe(() => send());
  const offs = [
    listen(READY_EVENT, () => send(true)),
    listen<TrayCommand>(COMMAND_EVENT, (e) => void run(e.payload).catch((err) => console.warn('[tray]', err))),
  ];
  send(true);
  return () => {
    unsubscribe();
    offs.forEach((off) => void off.then((f) => f()));
  };
}
