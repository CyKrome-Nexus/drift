// The page each desktop-level wallpaper window loads. The engine hands it the wallpaper to show
// through `window.__DRIFT_WALLPAPER__` before any script runs.

import { createRoot } from 'react-dom/client';
import { catalog } from '@drift/core';
import '@drift/tokens/tokens.css';
import './app.css';
import { Art } from './components/Art';

interface Payload {
  wallpaperId: number;
  /** The shared loop clock; the app's preview reads the same number. */
  startedAtMs: number;
  fps: string;
  muted: boolean;
}

const payload = (window as unknown as { __DRIFT_WALLPAPER__?: Payload }).__DRIFT_WALLPAPER__;
const w = catalog()[payload?.wallpaperId ?? -1];

createRoot(document.getElementById('root')!).render(
  // Edge to edge, no rounded window, nothing interactive: the desktop shows through the icons only.
  <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)' }}>{w && <Art w={w} startedAtMs={payload?.startedAtMs} />}</div>,
);
