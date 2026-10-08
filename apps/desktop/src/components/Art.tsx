import { useState } from 'react';
import { artCss, loopPositionMs, type Wallpaper } from '@drift/core';

/**
 * A wallpaper's moving art, filling its positioned parent. Remount (change `key`) to replay the
 * fade-in.
 *
 * `startedAtMs` joins a running loop: the animation starts at the same point the desktop
 * wallpaper is at, so the two show the same frame. Without it the loop starts from the top.
 */
export function Art({ w, paused = false, still = false, startedAtMs }: { w: Wallpaper; paused?: boolean; still?: boolean; startedAtMs?: number }) {
  // Fixed at mount. Recomputing it on a later render would shift an animation already running;
  // callers re-key to rejoin the loop.
  const [animationDelay] = useState(() =>
    startedAtMs === undefined ? undefined : `0s, ${-loopPositionMs(startedAtMs, Date.now())}ms`,
  );
  return (
    <div
      className={`art${still ? '' : ' is-moving'}${paused ? ' is-paused' : ''}`}
      style={{ backgroundImage: artCss(w, 'landscape'), animationDelay }}
      aria-hidden="true"
    />
  );
}
