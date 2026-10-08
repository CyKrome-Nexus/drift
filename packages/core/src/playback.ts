// One clock for a running wallpaper.
//
// The desktop engine records when a loop started; anything showing that wallpaper — the desktop
// windows, the app's preview — places itself at the same point in the loop from that one
// number, so they show the same frame without talking to each other.

/**
 * Length of one full cycle of the placeholder art: a 16s drift played forward then back
 * (`alternate`). Real loops will use the video's own duration instead.
 */
export const PREVIEW_LOOP_MS = 32_000;

/** Where in the loop we are, in ms from its start, for a loop that began at `startedAtMs`. */
export function loopPositionMs(startedAtMs: number, nowMs: number, loopMs: number = PREVIEW_LOOP_MS): number {
  if (loopMs <= 0) return 0;
  const elapsed = nowMs - startedAtMs;
  return ((elapsed % loopMs) + loopMs) % loopMs;
}

/**
 * How far the placeholder art has drifted at `positionMs` into the loop, from 0 (background at
 * 0% 0%) to 1 (100% 100%).
 *
 * The same curve as the `wpDrift` keyframes (16s, ease-in-out, alternate), so a page that draws
 * frames itself — the desktop wallpaper, which caps its frame rate — lands on the same frame as
 * the CSS-animated preview in the app.
 */
export function driftAt(positionMs: number, loopMs: number = PREVIEW_LOOP_MS): number {
  const half = loopMs / 2;
  const pos = ((positionMs % loopMs) + loopMs) % loopMs;
  const t = pos <= half ? pos / half : 2 - pos / half;
  return easeInOut(t);
}

/** CSS `ease-in-out`: cubic-bezier(0.42, 0, 0.58, 1). */
export function easeInOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = [0.42, 0, 0.58, 1];
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  // Solve x(s) = t for s by bisection (x is monotonic for this curve), then read y(s).
  let lo = 0;
  let hi = 1;
  let s = t;
  for (let i = 0; i < 30; i++) {
    s = (lo + hi) / 2;
    if (bez(x1, x2, s) < t) lo = s;
    else hi = s;
  }
  return bez(y1, y2, s);
}
