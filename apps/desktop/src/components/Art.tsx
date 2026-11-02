import { useEffect, useRef, useState } from 'react';
import { artCss, loopPositionMs, pickFile, type Wallpaper } from '@drift/core';

/**
 * A wallpaper filling its positioned parent: a provider's video (or its poster, `still`), or
 * Drift's generated art. Remount (change `key`) to replay the fade-in.
 *
 * `startedAtMs` joins a running loop: the preview starts at the same point the desktop
 * wallpaper is at, so the two show the same frame. Without it the loop starts from the top.
 */
export function Art({ w, paused = false, still = false, startedAtMs }: { w: Wallpaper; paused?: boolean; still?: boolean; startedAtMs?: number }) {
  if (w.media) return <MediaArt w={w} paused={paused} still={still} startedAtMs={startedAtMs} />;
  return <GeneratedArt w={w} paused={paused} still={still} startedAtMs={startedAtMs} />;
}

function GeneratedArt({ w, paused, still, startedAtMs }: { w: Wallpaper; paused: boolean; still: boolean; startedAtMs?: number }) {
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

/**
 * The height to pick a preview file for: the window's, in device pixels, but never above 1080.
 * A preview in the app never needs a 4K original; the desktop wallpaper picks its own.
 */
function windowPixels(): number {
  if (typeof window === 'undefined') return 1080;
  return Math.min(1080, Math.round(window.innerHeight * (window.devicePixelRatio || 1)));
}

function MediaArt({ w, paused, still, startedAtMs }: { w: Wallpaper; paused: boolean; still: boolean; startedAtMs?: number }) {
  const media = w.media!;
  const ref = useRef<HTMLVideoElement>(null);
  // Big previews (hero, detail) play the real file at the window's size: it is what the desktop
  // will show. If it can't load, the provider's small preview clip; failing that, the poster.
  const [sources] = useState(() =>
    [pickFile(media.files, windowPixels())?.url, media.preview].filter(
      (u, i, all): u is string => !!u && all.indexOf(u) === i,
    ),
  );
  const [attempt, setAttempt] = useState(0);
  const src = sources[attempt];

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (paused) v.pause();
    else void v.play().catch(() => {});
  }, [paused]);

  const join = () => {
    const v = ref.current;
    if (!v || startedAtMs === undefined || !Number.isFinite(v.duration) || v.duration <= 0) return;
    v.currentTime = loopPositionMs(startedAtMs, Date.now(), v.duration * 1000) / 1000;
  };

  return (
    <div className="art art-tinted" style={{ backgroundImage: artCss(w, 'landscape') }} aria-hidden="true">
      {still || !src ? (
        <img className="art-media" src={still ? media.thumbnail : media.poster} alt="" loading="lazy" draggable={false} />
      ) : (
        <video
          ref={ref}
          className="art-media"
          key={src}
          src={src}
          poster={media.poster}
          muted
          loop
          playsInline
          autoPlay={!paused}
          preload="auto"
          onLoadedMetadata={join}
          onError={() => setAttempt((n) => n + 1)}
        />
      )}
    </div>
  );
}
