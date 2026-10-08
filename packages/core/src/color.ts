// OKLCH → sRGB hex.
//
// The design specifies wallpaper art in OKLCH. Webviews render `oklch()` directly, but React
// Native's color parser does not, so both apps take hex from here and the two platforms agree
// to the byte. Out-of-gamut colors are clipped per channel, which is what browsers do too.

function toSrgbChannel(linear: number): number {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  return [
    toSrgbChannel(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    toSrgbChannel(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    toSrgbChannel(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

export function oklchToHex(l: number, c: number, h: number): string {
  return '#' + oklchToRgb(l, c, h).map((v) => v.toString(16).padStart(2, '0')).join('');
}
