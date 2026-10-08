import { useState } from 'react';
import { CATEGORIES, catalog, search, wallpaper, type Category } from '@drift/core';
import { WallpaperCard } from '../components/WallpaperCard';
import { useApp, type BrowseTab } from '../lib/store';

function Grid({ ids }: { ids: number[] }) {
  return (
    <div className="grid">
      {ids.map((id) => <WallpaperCard key={id} w={wallpaper(id)} />)}
    </div>
  );
}

function Discover() {
  const [cat, setCat] = useState<Category | 'All'>('All');
  const ids = catalog().filter((w) => cat === 'All' || w.category === cat).map((w) => w.id);
  return (
    <>
      <div className="chips">
        {(['All', ...CATEGORIES.map((c) => c.category)] as const).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <Grid ids={ids} />
    </>
  );
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
          {l.items.length ? <Grid ids={l.items} /> : <div className="empty">Nothing in {l.name} yet.</div>}
        </section>
      ))}
    </>
  );
}

function Favourites() {
  const favs = useApp((s) => s.favs);
  return favs.length ? <Grid ids={favs} /> : <div className="empty">Tap the heart on any wallpaper to keep it here.</div>;
}

export function Browse({ tab }: { tab: BrowseTab }) {
  const query = useApp((s) => s.query);
  const results = query ? search(query) : null;
  return (
    <div className="scroll">
      <div className="browse">
        <h2>{results ? `Results for “${query}”` : tab}</h2>
        {results ? (
          results.length ? <Grid ids={results.map((w) => w.id)} /> : <div className="empty">No wallpapers or creators match “{query}”.</div>
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
