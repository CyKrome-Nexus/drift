import { useEffect, useState } from 'react';
import { CaretLeft, CaretRight, Heart, Info, MonitorPlay } from '@phosphor-icons/react';
import { CATEGORIES, FEATURED, TRENDING, byCategory, catalog, wallpaper } from '@drift/core';
import { Art } from '../components/Art';
import { WallpaperCard } from '../components/WallpaperCard';
import { apply } from '../lib/actions';
import { go, liveSince as liveSinceOf, openDetail, toggleFav, useApp } from '../lib/store';

/** 60 ticks of 100ms: each featured wallpaper holds the hero for six seconds. */
const TICKS = 60;

function Hero() {
  // One state object, so advancing the slide and resetting the tick is a single pure update.
  const [{ hero, tick }, setCarousel] = useState({ hero: 0, tick: 0 });
  const [hovering, setHovering] = useState(false);
  const w = wallpaper(FEATURED[hero]);
  const fav = useApp((s) => s.favs.includes(w.id));
  const liveSince = useApp((s) => liveSinceOf(s, w.id));

  useEffect(() => {
    if (hovering) return;
    const iv = setInterval(() => {
      setCarousel((c) => (c.tick + 1 < TICKS ? { ...c, tick: c.tick + 1 } : { hero: (c.hero + 1) % FEATURED.length, tick: 0 }));
    }, 100);
    return () => clearInterval(iv);
  }, [hovering]);

  const jump = (i: number) => setCarousel({ hero: (i + FEATURED.length) % FEATURED.length, tick: 0 });

  return (
    <section className="hero" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <Art key={`${w.id}-${liveSince ?? 'preview'}`} w={w} startedAtMs={liveSince} />
      <div className="hero-shade-x" />
      <div className="hero-shade-y" />
      <div className="hero-copy">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="tag tag-accent">Featured</span>
          <span className="tag tag-neutral" style={{ gap: 6 }}><span className="live-dot" />Live · {w.fps} fps</span>
        </div>
        <h1 className="hero-title">{w.name}</h1>
        <p className="hero-desc">{w.description}</p>
        <div className="meta-line">
          <span className="mini-avatar">{w.initials}</span>
          <strong>{w.publisher}</strong><span>·</span><span>{w.category}</span><span>·</span><span>{w.res}</span><span>·</span><span>{w.loop} loop</span>
        </div>
        <div className="row-actions" style={{ marginTop: 6 }}>
          <button type="button" className="btn btn-primary" style={{ padding: '9px 16px', backdropFilter: 'blur(8px)' }} onClick={() => void apply(w)}>
            <MonitorPlay size={16} />Apply wallpaper
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: '9px 16px', backdropFilter: 'blur(8px)' }} onClick={() => openDetail(w.id)}>
            <Info size={16} />Details
          </button>
          <button type="button" className="btn btn-secondary btn-icon" style={{ backdropFilter: 'blur(8px)' }} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={() => toggleFav(w.id)}>
            <Heart size={16} weight={fav ? 'fill' : 'regular'} color="var(--color-accent)" />
          </button>
        </div>
      </div>
      <div className="hero-side">
        <div className="hero-counter">
          <span className="tabular"><b>{String(hero + 1).padStart(2, '0')}</b> / {String(FEATURED.length).padStart(2, '0')}</span>
          <button type="button" className="btn btn-secondary btn-icon" style={{ width: 28, height: 28 }} aria-label="Previous" onClick={() => jump(hero - 1)}><CaretLeft /></button>
          <button type="button" className="btn btn-secondary btn-icon" style={{ width: 28, height: 28 }} aria-label="Next" onClick={() => jump(hero + 1)}><CaretRight /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {FEATURED.map((id, i) => {
            const t = wallpaper(id);
            const progress = i === hero ? (tick / (TICKS - 1)) * 100 : i < hero ? 100 : 0;
            return (
              <button key={id} type="button" className="thumb" style={{ opacity: i === hero ? 1 : 0.6 }} onClick={() => jump(i)}>
                <div className="thumb-art" style={{ boxShadow: i === hero ? '0 0 0 1.5px var(--color-accent)' : '0 0 0 1px var(--color-divider)' }}>
                  <Art w={t} still />
                </div>
                <div className="thumb-bar"><div style={{ width: `${progress}%` }} /></div>
                <div className="thumb-name">{t.name}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const all = catalog();
  return (
    <div className="scroll">
      <Hero />
      <div className="rows">
        <section>
          <div className="row-head">
            <h4>Top 10 this week</h4>
            <span className="row-count">Updated daily</span>
          </div>
          <div className="hscroll row-track">
            {TRENDING.map((id, i) => <WallpaperCard key={id} w={all[id]} width={210} height={118} rank={i + 1} />)}
          </div>
        </section>
        {CATEGORIES.map(({ title, category }) => {
          const items = byCategory(category);
          return (
            <section key={category}>
              <div className="row-head">
                <h4>{title}</h4>
                <span className="row-count">{items.length * 34} wallpapers</span>
                <button type="button" className="row-more" onClick={() => go({ name: 'browse', tab: 'Discover' })}>See all</button>
              </div>
              <div className="hscroll row-track">
                {items.map((w) => <WallpaperCard key={w.id} w={w} width={248} height={140} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
