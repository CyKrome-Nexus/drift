import { canApply, wallpaper, type Wallpaper } from '@drift/core';
import { requirePro } from './account';
import { applyWallpaper, currentWallpaper, inTauri, onWallpaperChanged, stopWallpaper, type ApplyRequest } from './platform';
import { getState, setState, toast } from './store';

function request(w: Wallpaper, target: string): ApplyRequest {
  const { settings } = getState();
  return { wallpaperId: w.id, target, displays: settings.monitors, fps: settings.fps, muted: settings.muteAudio };
}

export async function apply(w: Wallpaper, target = getState().settings.applyTarget): Promise<void> {
  if (!requirePro.wallpaper(w)) return;
  try {
    const req = request(w, target);
    const outcome = await applyWallpaper(req);
    // `current` arrives from the engine's change event, with the loop's start time.
    if (outcome.live) setState({ lastApplied: req });
    // Say plainly when nothing reached the desktop, rather than claiming it did.
    const text = outcome.live
      ? `“${w.name}” is now your wallpaper${outcome.note ? ` · ${outcome.note}` : ''}`
      : `“${w.name}” selected · ${outcome.note ?? 'engine offline'}`;
    toast(text, outcome.live ? 'ok' : 'info');
  } catch (err) {
    toast(`Could not apply “${w.name}”: ${err instanceof Error ? err.message : String(err)}`, 'info');
  }
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

export async function connectEngine(): Promise<() => void> {
  const off = onWallpaperChanged((r) => setState({ current: r ? { id: r.wallpaperId, startedAtMs: r.startedAtMs } : null }));
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
    setState({ current: { id: running.wallpaperId, startedAtMs: running.startedAtMs } });
    return;
  }
  const { settings, lastApplied, account } = getState();
  if (settings.resumeOnStartup && lastApplied) {
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
