// The wallpaper art painted on a canvas: the same layers `artCss` describes, for the desktop
// wallpaper page (which draws its own frames) and for still frames on lock screens (Windows only
// shows still images there).

import { art, type ArtLayer, type Wallpaper } from '@drift/core';

/** The art is painted at 170% of the frame (`background-size` in app.css) and drifts across it. */
export const ART_SCALE = 1.7;

/**
 * Radii of a CSS `radial-gradient(<shape> at x y, …)` with the default `farthest-corner` size,
 * in a `w` × `h` box.
 */
export function farthestCorner(layer: Pick<ArtLayer, 'x' | 'y' | 'shape'>, w: number, h: number): { rx: number; ry: number } {
  const cx = (layer.x / 100) * w;
  const cy = (layer.y / 100) * h;
  const dx = Math.max(cx, w - cx);
  const dy = Math.max(cy, h - cy);
  if (layer.shape === 'circle') {
    const r = Math.hypot(dx, dy);
    return { rx: r, ry: r };
  }
  // An ellipse with the farthest-side aspect ratio that passes through the corner.
  return { rx: dx * Math.SQRT2, ry: dy * Math.SQRT2 };
}

/** Start and end of a CSS `linear-gradient(<angle>deg, …)` line across a `w` × `h` box. */
export function gradientLine(angleDeg: number, w: number, h: number): [number, number, number, number] {
  const a = (angleDeg * Math.PI) / 180;
  const [dx, dy] = [Math.sin(a), -Math.cos(a)];
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return [w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half];
}

/** Paint the whole art box (170% of the frame) for `w` into a `bw` × `bh` canvas context. */
export function paintBox(ctx: CanvasRenderingContext2D, w: Wallpaper, bw: number, bh: number): void {
  const { layers, base } = art(w, 'landscape');
  const base0 = ctx.createLinearGradient(...gradientLine(base.angle, bw, bh));
  base0.addColorStop(0, base.from);
  base0.addColorStop(1, base.to);
  ctx.fillStyle = base0;
  ctx.fillRect(0, 0, bw, bh);

  // CSS paints the first layer on top, so draw them last to first.
  for (const layer of [...layers].reverse()) {
    const { rx, ry } = farthestCorner(layer, bw, bh);
    ctx.save();
    ctx.translate((layer.x / 100) * bw, (layer.y / 100) * bh);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, layer.color);
    // Fade to the same colour at zero alpha, as `transparent` does in CSS (no grey fringe).
    g.addColorStop(layer.fade / 100, `${layer.color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(-bw / rx, -bh / ry, (2 * bw) / rx, (2 * bh) / ry);
    ctx.restore();
  }
}

/**
 * Where the art box sits in a `width` × `height` frame when it has drifted `drift` (0–1) of
 * the way: `background-position: drift% drift%`.
 */
export function boxOffset(drift: number, width: number, height: number, bw: number, bh: number): [number, number] {
  return [(width - bw) * drift, (height - bh) * drift];
}

/** The PNG bytes of `w`'s still frame at the screen's full resolution. */
export async function stillFrame(w: Wallpaper): Promise<Uint8Array> {
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(window.screen.width * scale);
  const height = Math.round(window.screen.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the lock-screen image');
  // The loop's first frame: the box's top-left on the frame's; the canvas clips the rest.
  paintBox(ctx, w, width * ART_SCALE, height * ART_SCALE);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not draw the lock-screen image');
  return new Uint8Array(await blob.arrayBuffer());
}
