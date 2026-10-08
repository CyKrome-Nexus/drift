import { CrownSimple, Heart } from '@phosphor-icons/react';
import type { Wallpaper } from '@drift/core';
import { openDetail, useApp } from '../lib/store';
import { Art } from './Art';

export function WallpaperCard({ w, width, height, rank }: { w: Wallpaper; width?: number; height?: number; rank?: number }) {
  const fav = useApp((s) => s.favs.includes(w.id));
  return (
    <button type="button" className="card-wrap" onClick={() => openDetail(w.id)} aria-label={`${w.name} by ${w.publisher}`}>
      {rank !== undefined && <span className="rank" aria-hidden="true">{rank}</span>}
      <div className="wcard" style={width ? { width } : { width: '100%' }}>
        <div className="wcard-art" style={height ? { height } : undefined}>
          <Art w={w} still />
          <span className="badge badge-l"><span className="dot" />LIVE</span>
          {w.tier === 'pro' ? (
            <span className="badge badge-r badge-pro"><CrownSimple size={9} weight="fill" />PRO · {w.res}</span>
          ) : (
            <span className="badge badge-r">{w.res}</span>
          )}
          {fav && <Heart className="card-heart" size={13} weight="fill" />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 2 }}>
          <span className="wcard-name">{w.name}</span>
          <span className="wcard-pub">{w.publisher}</span>
        </div>
      </div>
    </button>
  );
}
