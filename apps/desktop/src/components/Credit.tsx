import type { Wallpaper } from '@drift/core';
import { openExternal } from '../lib/platform';

/**
 * Who a wallpaper comes from, as its provider's terms ask: shown wherever a provider's wallpaper
 * is shown large. Drift's own generated wallpapers need none.
 */
export function Credit({ w }: { w: Wallpaper }) {
  if (!w.media) return null;
  const { provider, providerUrl, author, sourceUrl } = w.credit;
  return (
    <span className="credit">
      {w.media.kind === 'video' ? 'Video' : 'Image'}
      {author ? <> by {author}</> : null} on
      <button type="button" className="link" onClick={() => void openExternal(providerUrl)}>{provider}</button>
      {sourceUrl && (
        <>
          ·<button type="button" className="link" onClick={() => void openExternal(sourceUrl)}>Source</button>
        </>
      )}
    </span>
  );
}
