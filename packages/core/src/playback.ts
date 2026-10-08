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
