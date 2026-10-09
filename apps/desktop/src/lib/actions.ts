import { canApply, wallpaper, type Wallpaper } from '@drift/core';
import { requirePro } from './account';
import { applyWallpaper, currentWallpaper, inTauri, onWallpaperChanged, setLockScreen, stopWallpaper, type ApplyRequest, type Running } from './platform';
import { stillFrame } from './paint';
import { getState, setState, toast, type Current } from './store';

function request(w: Wallpaper, target: string, display: string | null = null): ApplyRequest {
  const { settings } = getState();
  return { wallpaperId: w.id, target, displays: settings.monitors, fps: settings.fps, muted: settings.muteAudio, display };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Put `w` on the desktop, the lock screen, or both. With "Per display", `display` picks the one
 * display that gets it (none means all of them).
 */
export async function apply(w: Wallpaper, target = getState().settings.applyTarget, display: string | null = null): Promise<void> {
  if (!requirePro.wallpaper(w)) return;
  const notes: string[] = [];
  let live = false;
  let lock = false;

  if (target !== 'Lock screen') {
    try {
      const req = request(w, target, display);
      const outcome = await applyWallpaper(req);
      // `current` arrives from the engine's change event, with the loop's start time.
      live = outcome.live;
      if (live) setState({ lastApplied: req });
      if (outcome.note) notes.push(outcome.note);
    } catch (err) {
      notes.push(message(err));
    }
  }
  if (target !== 'Desktop') {
    try {
      // Lock screens don't play loops (Windows takes a still image; macOS and Linux refuse).
      await setLockScreen(await stillFrame(w));
      lock = true;
    } catch (err) {
      notes.push(message(err));
    }
  }

  // Say plainly what reached the screen and what didn't, rather than claiming it all did.
  const where = live && lock ? 'wallpaper and lock screen' : live ? 'wallpaper' : lock ? 'lock screen (a still frame)' : null;
  const tail = notes.length ? ` · ${notes.join(' · ')}` : '';
  if (where) toast(`“${w.name}” is now your ${where}${tail}`, 'ok');
  else toast(`“${w.name}” selected${tail || ' · engine offline'}`, 'info');
}

export async function stop(): Promise<void> {
  await stopWallpaper();
}

export function download(w: Wallpaper): void {
  if (!requirePro.wallpaper(w)) return;
  // Downloads arrive with the real catalog; the placeholder art has no file to fetch.
  toast(`“${w.name}” · ${w.sizeMb} MB — downloads arrive with the wallpaper catalog`, 'info');
}

/**
 * Keep `current` in step with the engine, then honour "Resume last wallpaper on startup".
 * Call once the account is restored, so a lapsed Pro plan does not resume a Pro wallpaper.
 */
let resumed: Promise<void> | null = null;

function toCurrent(r: Running): Current {
  return { id: r.wallpaperId, startedAtMs: r.startedAtMs, displays: r.assignments ?? [], paused: r.paused ?? null };
}

function follow(r: Running | null): void {
  if (!r) {
    // Stopping (Remove, Quit) keeps the last choices, so the next launch can resume them.
    setState({ current: null });
    return;
  }
  const perDisplay = r.displays === 'Per display' ? { lastDisplays: (r.assignments ?? []).map((a) => ({ display: a.display, wallpaperId: a.wallpaperId })) } : {};
  setState({ current: toCurrent(r), ...perDisplay });
}

export async function connectEngine(): Promise<() => void> {
  const off = onWallpaperChanged(follow);
  // Once per launch, however many times the effect runs (React runs it twice in dev).
  resumed ??= resume();
  await resumed;
  return off;
}

async function resume(): Promise<void> {
  if (!inTauri) return;

  const running = await currentWallpaper();
  if (running) {
    // The webview reloaded while the engine kept playing.
    setState({ current: toCurrent(running) });
    return;
  }
  const { settings, lastApplied, lastDisplays, account } = getState();
  if (!settings.resumeOnStartup) return;
  if (settings.monitors === 'Per display' && lastDisplays.length) {
    // One display at a time; each apply keeps the others.
    for (const choice of lastDisplays) {
      const w = findWallpaper(choice.wallpaperId);
      if (w && canApply(account.plan.plan, w.tier)) {
        await applyWallpaper(request(w, 'Desktop', choice.display)).catch(() => null);
      }
    }
    return;
  }
  if (lastApplied) {
    const w = findWallpaper(lastApplied.wallpaperId);
    if (w && canApply(account.plan.plan, w.tier)) {
      await applyWallpaper(request(w, lastApplied.target)).catch(() => null);
    }
  }
}

function findWallpaper(id: number): Wallpaper | null {
  try {
    return wallpaper(id);
  } catch {
    return null;
  }
}
