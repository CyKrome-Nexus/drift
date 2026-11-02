// Which of a wallpaper's files to play or save, for a screen `target` pixels tall.

import type { MediaFile } from './catalog';

/**
 * The smallest file at least `target` tall. Files of unknown height (a provider's own encodes,
 * listed smallest first) beat an original far larger than the screen, which can run to
 * gigabytes; with nothing tall enough, the best there is.
 */
export function pickFile(files: readonly MediaFile[], target: number): MediaFile | null {
  if (!files.length) return null;
  const known = files.filter((f) => f.height > 0).sort((a, b) => a.height - b.height);
  const fit = known.find((f) => f.height >= target);
  const encodes = files.filter((f) => f.height === 0);
  if (encodes.length && (!fit || fit.height > target * 1.5)) return encodes[encodes.length - 1];
  return fit ?? known[known.length - 1] ?? files[files.length - 1];
}
