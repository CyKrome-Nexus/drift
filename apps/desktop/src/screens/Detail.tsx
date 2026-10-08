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
import { moreLike, wallpaper, type DesktopSettings } from '@drift/core';
import { Art } from '../components/Art';
import { requirePro } from '../lib/account';
import { apply, download } from '../lib/actions';
import { back, openDetail, setState, toast, toggleFav, updateSettings, useApp } from '../lib/store';

const TARGETS: Array<DesktopSettings['applyTarget']> = ['Desktop', 'Lock screen', 'Both'];

function ListPopover({ id, onClose }: { id: number; onClose: () => void }) {
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

export function Detail({ id }: { id: number }) {
  const w = wallpaper(id);
  const fav = useApp((s) => s.favs.includes(id));
  const target = useApp((s) => s.settings.applyTarget);
  const muted = useApp((s) => s.settings.muteAudio);
  const isPro = useApp((s) => s.account.plan.plan === 'pro');
  const [paused, setPaused] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // When this is the wallpaper on the desktop, the preview plays in step with it.
  const liveSince = useApp((s) => (s.current?.id === id ? s.current.startedAtMs : undefined));
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
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 32, height: 32 }} aria-label="Share" onClick={() => toast('Share links arrive with the wallpaper catalog', 'info')}><ShareNetwork /></button>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 32, height: 32 }} aria-label="Full-screen preview" onClick={() => void document.documentElement.requestFullscreen?.()}><ArrowsOut /></button>
          <button type="button" className="btn btn-glass btn-icon" style={{ width: 32, height: 32 }} aria-label="More"><DotsThree /></button>
        </div>
      </div>

      <div className="detail-copy">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {w.rank <= 10 && <span className="tag tag-outline" style={{ gap: 5 }}><Trophy weight="fill" />#{w.rank} in Trending</span>}
          <span className="tag tag-neutral">{w.category}</span>
          <span className="tag tag-neutral" style={{ gap: 6 }}><span className="live-dot" />Live</span>
          {w.tier === 'pro' && <span className="tag tag-accent" style={{ gap: 5 }}><CrownSimple weight="fill" />Drift Pro</span>}
        </div>
        <h1 className="detail-title">{w.name}</h1>
        <div className="publisher">
          <span className="pub-avatar">{w.initials}</span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span className="publisher-name">{w.publisher}<SealCheck weight="fill" color="var(--color-accent)" /></span>
            <span className="publisher-sub">{w.followers} followers · 46 wallpapers</span>
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginLeft: 8, padding: '4px 12px', fontSize: 12 }}>Follow</button>
        </div>
        <p className="hero-desc">{w.description}</p>
        <div className="meta-line">
          <span style={{ display: 'flex', gap: 1, color: 'var(--color-accent)' }}>
            <Star weight="fill" /><Star weight="fill" /><Star weight="fill" /><Star weight="fill" /><StarHalf weight="fill" />
          </span>
          <strong>{w.rating}</strong><span>({w.ratings} ratings)</span><span>·</span><span>{w.applies} applies</span>
        </div>
        <div className="specs">
          {[['Resolution', w.resFull], ['Frame rate', `${w.fps} fps`], ['Loop', w.loop], ['Size', `${w.sizeMb} MB`]].map(([k, v]) => (
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
          <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <Monitor />All displays
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button type="button" className="btn btn-glass-accent" style={{ padding: '10px 20px', fontSize: 14 }} onClick={() => void apply(w, target)}>
            {locked ? <CrownSimple size={17} weight="fill" /> : <MonitorPlay size={17} />}
            {locked ? 'Unlock with Pro' : 'Apply wallpaper'}
          </button>
          <button type="button" className="btn btn-glass" style={{ padding: '10px 14px' }} onClick={() => download(w)}><DownloadSimple size={16} />Download</button>
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
        <span className="eyebrow" style={{ marginTop: 6 }}>More from {w.publisher}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {moreLike(w).map((m) => (
            <button key={m.id} type="button" className="more-card" onClick={() => openDetail(m.id)}>
              <div className="thumb-art"><Art w={m} still /></div>
              <span style={{ fontSize: 11, color: 'var(--color-neutral-300)' }}>{m.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
