// Playback rules for the desktop wallpaper page: how often to draw and at what resolution.
// Pushed by the engine (`window.__DRIFT_PLAYBACK__`) and changed live from Settings.

export interface PagePlayback {
  /** Why playback is paused (battery, fullscreen app, CPU), or null while it plays. */
  paused: string | null;
  /** "30" | "60" | "Unlimited" */
  fps: string;
  /** "Low" | "Balanced" | "High" */
  quality: string;
}

export const DEFAULT_PLAYBACK: PagePlayback = { paused: null, fps: '60', quality: 'High' };

/** Shortest gap between frames, in ms. Unlimited draws on every display refresh. */
export function frameInterval(fps: string): number {
  const n = Number(fps);
  return Number.isFinite(n) && n > 0 ? 1000 / n : 0;
}

/**
 * Whether a frame is due at `now` after drawing one at `last` (both rAF timestamps). A
 * millisecond of slack, so a 60 fps cap on a 60 Hz display doesn't skip every other refresh on
 * timer jitter.
 */
export function frameDue(last: number, now: number, fps: string): boolean {
  return now - last >= frameInterval(fps) - 1;
}

/**
 * Share of the display's pixels each side is rendered at. Balanced renders half the pixels
 * (1/√2 per side), as Settings › Performance promises; Low a quarter.
 */
export function qualityScale(quality: string): number {
  return quality === 'Low' ? 0.5 : quality === 'Balanced' ? Math.SQRT1_2 : 1;
}

/** Read what the engine last pushed, falling back field by field to the defaults. */
export function readPlayback(raw: unknown): PagePlayback {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<PagePlayback>;
  return {
    paused: typeof p.paused === 'string' ? p.paused : null,
    fps: typeof p.fps === 'string' ? p.fps : DEFAULT_PLAYBACK.fps,
    quality: typeof p.quality === 'string' ? p.quality : DEFAULT_PLAYBACK.quality,
  };
}
