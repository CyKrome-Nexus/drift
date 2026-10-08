// Placeholder wallpaper art: three soft colour fields over a dark diagonal base.
//
// Described as data so the desktop can paint it with CSS gradients and the phone with SVG, from
// one source. The layer positions differ by form factor exactly as they do in the design.

import type { Wallpaper } from './catalog';
import { oklchToHex } from './color';

export type ArtForm = 'landscape' | 'portrait';

export interface ArtLayer {
  /** Centre, in percent of the frame. */
  x: number;
  y: number;
  color: string;
  /** Where the field fades to transparent, in percent of the gradient radius. */
  fade: number;
  shape: 'ellipse' | 'circle';
}

export interface Art {
  layers: [ArtLayer, ArtLayer, ArtLayer];
  base: { angle: number; from: string; to: string };
}

const POSITIONS: Record<ArtForm, ReadonlyArray<readonly [number, number, number, number, number, number]>> = {
  landscape: [[22, 30, 78, 72, 50, 95], [72, 22, 25, 80, 88, 55], [50, 45, 12, 15, 88, 88], [30, 78, 72, 28, 50, 8]],
  portrait: [[30, 22, 70, 70, 40, 96], [72, 30, 25, 74, 80, 50], [50, 40, 15, 20, 85, 88], [28, 75, 74, 30, 50, 8]],
};

export function art(w: Wallpaper, form: ArtForm): Art {
  const p = POSITIONS[form][w.id % 4];
  const [a, b, c] = w.hues;
  return {
    layers: [
      { x: p[0], y: p[1], color: oklchToHex(0.74, 0.13, a), fade: 46, shape: 'ellipse' },
      { x: p[2], y: p[3], color: oklchToHex(0.56, 0.14, b), fade: 52, shape: 'ellipse' },
      { x: p[4], y: p[5], color: oklchToHex(0.42, 0.11, c), fade: 60, shape: 'circle' },
    ],
    base: { angle: form === 'landscape' ? 160 : 170, from: oklchToHex(0.24, 0.05, a), to: oklchToHex(0.15, 0.03, b) },
  };
}

/** The art as a CSS `background` value. */
export function artCss(w: Wallpaper, form: ArtForm = 'landscape'): string {
  const { layers, base } = art(w, form);
  const fields = layers.map(
    (l) => `radial-gradient(${l.shape} at ${l.x}% ${l.y}%, ${l.color} 0%, transparent ${l.fade}%)`,
  );
  return [...fields, `linear-gradient(${base.angle}deg, ${base.from}, ${base.to})`].join(', ');
}
