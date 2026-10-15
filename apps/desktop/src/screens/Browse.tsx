import { useEffect, useState } from 'react';
import { CATEGORIES, type Category, type Wallpaper, type WallpaperId } from '@drift/core';
import type { Feed } from '@drift/wallpapers';
import { WallpaperCard } from '../components/WallpaperCard';
import { useFeed, useKnown } from '../lib/catalog';
import { useApp, type BrowseTab } from '../lib/store';

function Grid({ items }: { items: Wallpaper[] }) {
  return (
    <div className="grid">
      {items.map((w) => <WallpaperCard key={w.id} w={w} />)}
    </div>
  );
}

/** A feed as a grid, with a button for the next page. */
function FeedGrid({ feed, empty }: { feed: Feed; empty: string }) {
  const { items, loading, error, more } = useFeed(feed);
  if (!items.length) {
    if (loading) return <div className="empty">Loading wallpapers…</div>;
    return <div className="empty">{error ? `Couldn’t load wallpapers · ${error}` : empty}</div>;
  }
  return (
    <>
      <Grid items={items} />
      {(more || loading) && (
        <div className="load-more">
          <button type="button" className="btn btn-secondary" disabled={!more} onClick={() => more?.()}>{loading ? 'Loading…' : 'Show more'}</button>
        </div>
      )}
    </>
  );
}

function Discover() {
  const [cat, setCat] = useState<Category | 'All'>('All');
  return (
    <>
      <div className="chips">
        {(['All', ...CATEGORIES.map((c) => c.category)] as const).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <FeedGrid feed={cat === 'All' ? { kind: 'trending' } : { kind: 'category', category: cat }} empty="Nothing here yet." />
    </>
  );
}

function SavedGrid({ ids, empty }: { ids: readonly WallpaperId[]; empty: string }) {
  const items = useKnown(ids);
  return items.length ? <Grid items={items} /> : <div className="empty">{empty}</div>;
}

function Library() {
  const lists = useApp((s) => s.lists);
  if (!lists.some((l) => l.items.length)) {
    return <div className="empty">Your lists are empty. Open a wallpaper and choose “Add to list”.</div>;
  }
  return (
    <>
      {lists.map((l) => (
        <section key={l.id} className="group">
          <span className="group-title">{l.name} · {l.items.length}</span>
          <SavedGrid ids={l.items} empty={`Nothing in ${l.name} yet.`} />
        </section>
      ))}
    </>
  );
}

function Favourites() {
  const favs = useApp((s) => s.favs);
  return <SavedGrid ids={favs} empty="Tap the heart on any wallpaper to keep it here." />;
}

/** `value`, once it has stopped changing for `ms`: one search per pause in typing, not per key. */
function useSettled(value: string, ms = 450): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return value ? settled : '';
}

export function Browse({ tab }: { tab: BrowseTab }) {
  const typed = useApp((s) => s.query).trim();
  const query = useSettled(typed);
  return (
    <div className="scroll">
      <div className="browse">
        <h2>{typed ? `Results for “${typed}”` : tab}</h2>
        {typed && !query ? (
          <div className="empty">Searching…</div>
        ) : query ? (
          <FeedGrid feed={{ kind: 'search', query }} empty={`No wallpapers match “${query}”.`} />
        ) : tab === 'Discover' ? (
          <Discover />
        ) : tab === 'Library' ? (
          <Library />
        ) : (
          <Favourites />
        )}
      </div>
    </div>
  );
}
