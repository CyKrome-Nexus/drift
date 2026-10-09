// The page each desktop-level wallpaper window loads. The engine hands it the wallpaper to show
// through `window.__DRIFT_WALLPAPER__` before any script runs, and playback rules (paused, frame
// rate, quality) through `window.__DRIFT_PLAYBACK__`, updated live with a `drift-playback` event.
//
// Unlike the app's previews (a CSS animation), this page draws its own frames on a canvas so it
// can cap the frame rate, render below full resolution, and stop drawing while paused. It reads
// the same loop clock and curve, so it shows the same frame as the preview.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { catalog, driftAt, loopPositionMs, type Wallpaper } from '@drift/core';
import '@drift/tokens/tokens.css';
import './app.css';
import { frameDue, qualityScale, readPlayback, type PagePlayback } from './lib/frames';
import { ART_SCALE, boxOffset, paintBox } from './lib/paint';

interface Payload {
  wallpaperId: number;
  /** The shared loop clock; the app's preview reads the same number. */
  startedAtMs: number;
  muted: boolean;
}

type DriftWindow = Window & { __DRIFT_WALLPAPER__?: Payload; __DRIFT_PLAYBACK__?: unknown };

const host = window as DriftWindow;
const payload = host.__DRIFT_WALLPAPER__;
const w = catalog()[payload?.wallpaperId ?? -1];

function usePlayback(): PagePlayback {
  const [playback, setPlayback] = useState(() => readPlayback(host.__DRIFT_PLAYBACK__));
  useEffect(() => {
    // The engine re-sends every couple of seconds; only a real change re-renders.
    const onChange = () =>
      setPlayback((prev) => {
        const next = readPlayback(host.__DRIFT_PLAYBACK__);
        return next.paused === prev.paused && next.fps === prev.fps && next.quality === prev.quality ? prev : next;
      });
    window.addEventListener('drift-playback', onChange);
    return () => window.removeEventListener('drift-playback', onChange);
  }, []);
  return playback;
}

function useViewport(): { width: number; height: number; dpr: number } {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function LiveArt({ w, startedAtMs }: { w: Wallpaper; startedAtMs: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { paused, fps, quality } = usePlayback();
  const { width, height, dpr } = useViewport();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Render quality: fewer pixels on the canvas, stretched to the window by CSS.
    const scale = dpr * qualityScale(quality);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    // The art box is painted once; each frame only moves it.
    const box = document.createElement('canvas');
    box.width = Math.ceil(canvas.width * ART_SCALE);
    box.height = Math.ceil(canvas.height * ART_SCALE);
    const boxCtx = box.getContext('2d');
    if (!boxCtx) return;
    paintBox(boxCtx, w, box.width, box.height);

    const draw = () => {
      const drift = driftAt(loopPositionMs(startedAtMs, Date.now()));
      const [x, y] = boxOffset(drift, canvas.width, canvas.height, box.width, box.height);
      ctx.drawImage(box, x, y);
    };
    // Paused: one frame where the loop is now, then nothing until playback resumes — and then
    // straight to where the shared clock says, still in step with the app's preview.
    draw();
    if (paused) return;

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (frameDue(last, now, fps)) {
        last = now;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [w, startedAtMs, paused, fps, quality, width, height, dpr]);

  return <canvas ref={ref} className="wallpaper-canvas" aria-hidden="true" />;
}

createRoot(document.getElementById('root')!).render(
  // Edge to edge, no rounded window, nothing interactive: the desktop shows through the icons only.
  <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)' }}>
    {w && payload && <LiveArt w={w} startedAtMs={payload.startedAtMs} />}
  </div>,
);
