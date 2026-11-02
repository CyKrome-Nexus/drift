import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowsOut,
  CheckSquare,
  CrownSimple,
  DotsThree,
  DownloadSimple,
  Heart,
  Monitor,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  SealCheck,
  ShareNetwork,
  SpeakerHigh,
  SpeakerSlash,
  Square,
  Star,
  StarHalf,
  Trophy,
} from '@phosphor-icons/react';
import type { DesktopSettings, Wallpaper, WallpaperId } from '@drift/core';
import { Art } from '../components/Art';
import { Credit } from '../components/Credit';
import { requirePro } from '../lib/account';
import { apply, download } from '../lib/actions';
import { useFeed, useWallpaper } from '../lib/catalog';
import { displayLabel, listDisplays, type Display } from '../lib/platform';
import { back, liveSince as liveSinceOf, openDetail, setState, toast, toggleFav, updateSettings, useApp } from '../lib/store';

const TARGETS: Array<DesktopSettings['applyTarget']> = ['Desktop', 'Lock screen', 'Both'];

/**
 * Which displays an apply reaches. With "Per display" and more than one screen, a choice of
 * all of them or one; otherwise a label for what "Displays" in Settings says.
 */
function DisplayPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const mode = useApp((s) => s.settings.monitors);
  const [displays, setDisplays] = useState<Display[]>([]);

  useEffect(() => {
    if (mode !== 'Per display') return;
    let live = true;
    listDisplays().then((d) => live && setDisplays(d)).catch(() => live && setDisplays([]));
    return () => {
      live = false;
    };
  }, [mode]);

  // A display unplugged while the picker was open falls back to all of them.
  useEffect(() => {
    if (value && displays.length && !displays.some((d) => d.id === value)) onChange(null);
  }, [displays, value, onChange]);

  if (mode !== 'Per display' || displays.length < 2) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
        <Monitor />{mode === 'Span' ? 'Spanned across displays' : 'All displays'}
      </span>
    );
  }
  return (
    <div className="seg-glass glass" role="radiogroup" aria-label="Display">
      <button type="button" className="seg-opt-btn" aria-pressed={value === null} onClick={() => onChange(null)}>All</button>
      {displays.map((d, i) => (
        <button key={d.id} type="button" className="seg-opt-btn" aria-pressed={value === d.id} title={`${d.width}×${d.height}`} onClick={() => onChange(d.id)}>
          {displayLabel(d, i)}
        </button>
      ))}
    </div>
  );
}

function ListPopover({ id, onClose }: { id: WallpaperId; onClose: () => void }) {
  const lists = useApp((s) => s.lists);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Deferred so the click that opened the popover does not immediately close it.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown));
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const toggle = (listId: string) =>
    setState((s) => ({
      lists: s.lists.map((l) =>
        l.id !== listId ? l : { ...l, items: l.items.includes(id) ? l.items.filter((x) => x !== id) : [id, ...l.items] },
      ),
    }));

  const create = () => {
    const n = name.trim();
    if (!n) return;
    setState((s) => ({ lists: [...s.lists, { id: `${Date.now()}`, name: n, items: [id] }] }));
    toast(`Added to “${n}”`);
    setNaming(false);
    setName('');
  };

  return (
    <div ref={ref} className="popover" role="menu">
      <span className="eyebrow" style={{ fontSize: 10, padding: '6px 8px 4px', color: 'var(--color-neutral-500)' }}>Save to list</span>
      {lists.map((l) => {
        const on = l.items.includes(id);
        return (
          <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={on} className="pop-item" onClick={() => toggle(l.id)}>
            {on ? <CheckSquare size={16} weight="fill" color="var(--color-accent)" /> : <Square size={16} color="var(--color-accent)" />}
            <span style={{ flex: 1 }}>{l.name}</span>
            <span className="pop-count">{l.items.length}</span>
          </button>
        );
      })}
      {naming ? (
        <form onSubmit={(e) => { e.preventDefault(); create(); }} style={{ padding: 4 }}>
          <input className="input" autoFocus placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNaming(false)} />
        </form>
      ) : (
        <button type="button" className="pop-item is-accent" onClick={() => requirePro.newList() && setNaming(true)}>
          <Plus />New list
        </button>
      )}
    </div>
  );
}

export function Detail({ id }: { id: WallpaperId }) {
  const w = useWallpaper(id);
  useEffect(() => {
    if (w !== null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [w]);
  if (w === undefined) return <div className="detail"><div className="empty" style={{ margin: 'auto' }}>Loading…</div></div>;
  if (w === null) {
    return (
      <div className="detail">
        <div className="detail-bar"><button type="button" className="btn btn-glass" onClick={back}><ArrowLeft />Back</button></div>
        <div className="empty" style={{ margin: 'auto' }}>This wallpaper is no longer available from its provider.</div>
      </div>
    );
  }
  return <DetailView key={w.id} w={w} />;
}

/** Up to three more from the same category, for the side panel. */
function MoreLike({ w }: { w: Wallpaper }) {
  const items = useFeed({ kind: 'category', category: w.category }).items.filter((x) => x.id !== w.id).slice(0, 3);
  if (!items.length) return null;
  return (
    <>
      <span className="eyebrow" style={{ marginTop: 6 }}>More like this</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {items.map((m) => (
          <button key={m.id} type="button" className="more-card" onClick={() => openDetail(m.id)}>
            <div className="thumb-art"><Art w={m} still /></div>
            <span style={{ fontSize: 11, color: 'var(--color-neutral-300)' }}>{m.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function DetailView({ w }: { w: Wallpaper }) {
  const id = w.id;
  const fav = useApp((s) => s.favs.includes(id));
  const target = useApp((s) => s.settings.applyTarget);
  const muted = useApp((s) => s.settings.muteAudio);
  const isPro = useApp((s) => s.account.plan.plan === 'pro');
  const [paused, setPaused] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // When this is the wallpaper on the desktop, the preview plays in step with it.
  const liveSince = useApp((s) => liveSinceOf(s, id));
  const [display, setDisplay] = useState<string | null>(null);
  const [rejoin, setRejoin] = useState(0);
  const locked = w.tier === 'pro' && !isPro;

  useEffect(() => {
    setPaused(false);
    setListOpen(false);
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !listOpen && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listOpen]);

  return (
    <div className="detail">
      <Art key={`${id}-${liveSince ?? 'preview'}-${rejoin}`} w={w} paused={paused} startedAtMs={liveSince} />
      <div className="detail-shade-x" />
      <div className="detail-shade-y" />

      <div className="detail-bar">
        <button type="button" className="btn btn-glass" onClick={back}><ArrowLeft />Back</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-glass btn-icon"
            style={{ width: 32, height: 32 }}
            aria-label="Copy link"
            onClick={() => {
              const url = w.credit.sourceUrl;
              if (!url) return toast('Share links arrive with Drift’s own catalog', 'info');
              navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url, 'info'));
            }}
          >
            <ShareNetwork />
          </button>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 32, height: 32 }} aria-label="Full-screen preview" onClick={() => void document.documentElement.requestFullscreen?.()}><ArrowsOut /></button>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 32, height: 32 }} aria-label="More"><DotsThree /></button>
        </div>
      </div>

      <div className="detail-copy">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {w.rank !== undefined && w.rank <= 10 && <span className="tag tag-outline" style={{ gap: 5 }}><Trophy weight="fill" />#{w.rank} in Trending</span>}
          <span className="tag tag-neutral">{w.category}</span>
          <span className="tag tag-neutral" style={{ gap: 6 }}><span className="live-dot" />Live</span>
          {w.tier === 'pro' && <span className="tag tag-accent" style={{ gap: 5 }}><CrownSimple weight="fill" />Drift Pro</span>}
        </div>
        <h1 className="detail-title">{w.name}</h1>
        <div className="publisher">
          <span className="pub-avatar">{w.initials}</span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span className="publisher-name">{w.publisher}{!w.media && <SealCheck weight="fill" color="var(--color-accent)" />}</span>
            {w.stats ? <span className="publisher-sub">{w.stats.followers} followers · 46 wallpapers</span> : <Credit w={w} />}
          </div>
          {!w.media && <button type="button" className="btn btn-secondary" style={{ marginLeft: 8, padding: '4px 12px', fontSize: 12 }}>Follow</button>}
        </div>
        <p className="hero-desc">{w.description}</p>
        {w.stats && (
          <div className="meta-line">
            <span style={{ display: 'flex', gap: 1, color: 'var(--color-accent)' }}>
              <Star weight="fill" /><Star weight="fill" /><Star weight="fill" /><Star weight="fill" /><StarHalf weight="fill" />
            </span>
            <strong>{w.stats.rating}</strong><span>({w.stats.ratings} ratings)</span><span>·</span><span>{w.stats.applies} applies</span>
          </div>
        )}
        <div className="specs">
          {([
            ['Resolution', w.resFull],
            ['Frame rate', w.fps ? `${w.fps} fps` : null],
            ['Loop', w.loop],
            ['Size', w.sizeMb ? `${w.sizeMb} MB` : null],
            ['Licence', w.media ? w.credit.license.split(':')[0] : null],
          ] satisfies Array<[string, string | null]>).filter((x): x is [string, string] => !!x[1]).map(([k, v]) => (
            <div key={k} className="spec glass"><span>{k}</span><span>{v}</span></div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Apply to</span>
          <div className="seg-glass glass">
            {TARGETS.map((t) => (
              <button key={t} type="button" className="seg-opt-btn" aria-pressed={target === t} onClick={() => updateSettings({ applyTarget: t })}>{t}</button>
            ))}
          </div>
          <DisplayPicker value={display} onChange={setDisplay} />
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button type="button" className="btn btn-glass-accent" style={{ padding: '10px 20px', fontSize: 14 }} onClick={() => void apply(w, target, display)}>
            {locked ? <CrownSimple size={17} weight="fill" /> : <MonitorPlay size={17} />}
            {locked ? 'Unlock with Pro' : 'Apply wallpaper'}
          </button>
          <button type="button" className="btn btn-glass" style={{ padding: '10px 14px' }} onClick={() => void download(w)}><DownloadSimple size={16} />Download</button>
          <button type="button" className="btn btn-glass" style={{ padding: '10px 14px' }} aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}><Plus size={16} />Add to list</button>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 40, height: 40 }} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={() => toggleFav(id)}>
            <Heart size={17} weight={fav ? 'fill' : 'regular'} color="var(--color-accent)" />
          </button>
          {listOpen && <ListPopover id={id} onClose={() => setListOpen(false)} />}
        </div>
      </div>

      <div className="detail-side">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-300)', marginRight: 4 }}>Live preview</span>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 30, height: 30 }} aria-label={paused ? 'Play preview' : 'Pause preview'} onClick={() => {
            // Unpausing a live preview jumps back to where the desktop is, rather than resuming
            // from the paused frame and drifting out of step.
            if (paused && liveSince !== undefined) setRejoin((n) => n + 1);
            setPaused((p) => !p);
          }}>
            {paused ? <Play weight="fill" /> : <Pause weight="fill" />}
          </button>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 30, height: 30 }} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => updateSettings({ muteAudio: !muted })}>
            {muted ? <SpeakerSlash /> : <SpeakerHigh />}
          </button>
        </div>
        <MoreLike w={w} />
      </div>
    </div>
  );
}
