// The tray popover: what opens from Drift's menu-bar / tray icon. A preview of the desktop
// wallpaper (in step with it), playback controls, recents and lists, and Drift's own CPU, memory
// and cache. It only draws: the main window sends a snapshot of what to show and runs what this
// page asks for (src/lib/trayBridge.ts); the window itself is placed by src-tauri/src/tray.rs.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Check,
  CrownSimple,
  FastForward,
  Pause,
  Play,
  Rewind,
  Shuffle,
} from '@phosphor-icons/react';
import { generatedWallpapers, type DesktopSettings } from '@drift/core';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@drift/tokens/tokens.css';
import './app.css';
import './tray.css';
import { Art } from './components/Art';
import { APP_VERSION, clearCache, inTauri, usage, type Usage } from './lib/platform';
import { COMMAND_EVENT, READY_EVENT, STATE_EVENT, VISIBILITY_EVENT, type TrayCommand, type TrayItem, type TraySnapshot } from './lib/trayProtocol';

type Panel = 'root' | 'fps' | 'quality' | 'recents' | 'lists';

const FPS: ReadonlyArray<{ value: DesktopSettings['fps']; label: string; pro?: true }> = [
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' },
  { value: 'Unlimited', label: 'Unlimited', pro: true },
];
const QUALITY: ReadonlyArray<DesktopSettings['quality']> = ['Low', 'Balanced', 'High'];
const STATS_EVERY_MS = 2000;
const isMac = navigator.userAgent.includes('Mac');

function send(cmd: TrayCommand, close = false): void {
  if (!inTauri) return;
  void emitTo('main', COMMAND_EVENT, cmd);
  if (close) void invoke('tray_hide');
}

/** Under plain `vite` there is no main window to ask; show something to design against. */
function sample(): TraySnapshot {
  const ws = generatedWallpapers();
  const item = (i: number): TrayItem => ({ wallpaper: ws[i], locked: ws[i].tier === 'pro', current: i === 0 });
  return {
    version: APP_VERSION,
    now: { wallpaper: ws[0], startedAtMs: Date.now(), paused: null, held: false },
    queue: { label: 'Favourites', size: 4 },
    shuffle: false,
    fps: '60',
    quality: 'High',
    pro: false,
    recents: [0, 1, 2, 3, 4].map(item),
    lists: [
      { source: 'favs', name: 'Favourites', count: 4, playing: true },
      { source: 'list:workspace', name: 'Workspace', count: 0, playing: false },
    ],
    launchAtLogin: false,
    saving: false,
  };
}

function useSnapshot(): TraySnapshot | null {
  const [snap, setSnap] = useState<TraySnapshot | null>(() => (inTauri ? null : sample()));
  useEffect(() => {
    if (!inTauri) return;
    const off = listen<TraySnapshot>(STATE_EVENT, (e) => setSnap(e.payload));
    // Asked for once listening, so the answer can't arrive before anyone hears it.
    void off.then(() => emitTo('main', READY_EVENT));
    return () => void off.then((f) => f());
  }, []);
  return snap;
}

/** Whether the popover is on screen. Previews play and stats poll only while it is. */
function useOpen(): boolean {
  const [open, setOpen] = useState(!inTauri);
  useEffect(() => {
    if (!inTauri) return;
    const off = listen<boolean>(VISIBILITY_EVENT, (e) => setOpen(e.payload));
    return () => void off.then((f) => f());
  }, []);
  return open;
}

function useUsage(open: boolean): [Usage | null, () => void] {
  const [stats, setStats] = useState<Usage | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const read = () => void usage().then((u) => live && setStats(u), () => {});
    read();
    const t = setInterval(read, STATS_EVERY_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [open, tick]);
  return [stats, () => setTick((n) => n + 1)];
}

/** The window is as tall as the page; Rust keeps it hung from the icon as it changes. */
function useFitWindow(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !inTauri) return;
    let last = 0;
    const fit = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      void invoke('tray_fit', { height });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}

function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

function Tray() {
  const snap = useSnapshot();
  const open = useOpen();
  const [panel, setPanel] = useState<Panel>('root');
  const [stats, refreshStats] = useUsage(open);
  const [cleared, setCleared] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useFitWindow(root);

  // Every opening starts at the top level, as a menu does.
  useEffect(() => {
    if (!open) setPanel('root');
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panel !== 'root') setPanel('root');
        else if (inTauri) void invoke('tray_hide');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        if (inTauri) void invoke('quit_app');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(() => setCleared(null), 2500);
    return () => clearTimeout(t);
  }, [cleared]);

  const className = inTauri ? 'tray' : 'tray is-preview';
  if (!snap) return <div ref={root} className={className} />;

  const onClear = async () => {
    setCleared('Clearing…');
    const freed = await clearCache().catch(() => 0);
    setCleared(freed ? `Cleared ${bytes(freed)}` : 'Nothing to clear');
    refreshStats();
  };

  return (
    <div ref={root} className={className}>
      {panel === 'root' ? (
        <div className="tray-panel" key="root">
          <Preview snap={snap} open={open} />
          <div className="tray-meta">
            <span>Version {snap.version}</span>
            {snap.queue.size > 0 && <span className="tray-meta-queue">{snap.queue.label}</span>}
          </div>
          <Sep />
          <Controls snap={snap} />
          <Sep />
          <Item onClick={() => send({ type: 'open' }, true)}>Open Drift</Item>
          {snap.now && <Item onClick={() => send({ type: 'remove' })}>Remove wallpaper</Item>}
          <Item more value={FPS.find((f) => f.value === snap.fps)?.label} onClick={() => setPanel('fps')}>Frame rate</Item>
          <Item more value={snap.quality} onClick={() => setPanel('quality')}>Quality</Item>
          <Sep />
          <Item more onClick={() => setPanel('recents')}>Recents</Item>
          <Item more onClick={() => setPanel('lists')}>Playlists</Item>
          <Sep />
          <Stat>CPU: {stats ? `${stats.cpu.toFixed(1)}%` : '—'}</Stat>
          <Stat>RAM: {stats ? bytes(stats.memory) : '—'}</Stat>
          <Stat>Cache: {stats ? bytes(stats.cache) : '—'}</Stat>
          <Sep />
          <Item onClick={() => void onClear()} disabled={cleared === 'Clearing…'}>{cleared ?? 'Clear Cache'}</Item>
          <Item checked={snap.saving} onClick={() => send({ type: 'saver' })}>Reduce CPU/RAM</Item>
          <Item checked={snap.launchAtLogin} onClick={() => send({ type: 'launchAtLogin' })}>Start on login</Item>
          <Item onClick={() => send({ type: 'open', section: 'General' }, true)}>Settings</Item>
          {!snap.pro && (
            <Item onClick={() => send({ type: 'upgrade' }, true)}>
              Get Pro <CrownSimple size={11} weight="fill" className="tray-crown" />
            </Item>
          )}
          <Sep />
          <Item shortcut={isMac ? '⌘Q' : 'Ctrl+Q'} onClick={() => inTauri && void invoke('quit_app')}>Quit</Item>
        </div>
      ) : (
        <div className="tray-panel is-sub" key={panel}>
          <button type="button" className="tray-back" onClick={() => setPanel('root')}>
            <CaretLeft size={12} weight="bold" />
            {{ fps: 'Frame rate', quality: 'Quality', recents: 'Recents', lists: 'Playlists' }[panel]}
          </button>
          <Sep />
          {panel === 'fps' &&
            FPS.map((f) => (
              <Item key={f.value} checked={snap.fps === f.value} onClick={() => (send({ type: 'fps', value: f.value }, !!f.pro && !snap.pro), setPanel('root'))}>
                {f.label}
                {f.pro && !snap.pro && <CrownSimple size={11} weight="fill" className="tray-crown" />}
              </Item>
            ))}
          {panel === 'quality' &&
            QUALITY.map((q) => (
              <Item key={q} checked={snap.quality === q} onClick={() => (send({ type: 'quality', value: q }), setPanel('root'))}>
                {q}
              </Item>
            ))}
          {panel === 'recents' &&
            (snap.recents.length ? (
              snap.recents.map((r) => (
                <Item key={r.wallpaper.id} thumb={r} checked={r.current} onClick={() => send({ type: 'apply', id: r.wallpaper.id }, true)}>
                  <span className="tray-name">{r.wallpaper.name}</span>
                  {r.locked && <CrownSimple size={11} weight="fill" className="tray-crown" />}
                </Item>
              ))
            ) : (
              <Stat>Wallpapers you apply show up here</Stat>
            ))}
          {panel === 'lists' &&
            snap.lists.map((l) => (
              <Item key={l.source} checked={l.playing} value={String(l.count)} disabled={!l.count} onClick={() => send({ type: 'play', source: l.source }, true)}>
                <span className="tray-name">{l.name}</span>
              </Item>
            ))}
        </div>
      )}
    </div>
  );
}

/** The desktop's wallpaper, playing in step with it while the popover is open. */
function Preview({ snap, open }: { snap: TraySnapshot; open: boolean }) {
  const now = snap.now;
  if (!now) {
    return (
      <button type="button" className="tray-preview is-empty" onClick={() => send({ type: 'open' }, true)}>
        <span>Nothing on the desktop</span>
        <span className="tray-preview-hint">Choose a wallpaper in Drift</span>
      </button>
    );
  }
  const paused = now.paused !== null;
  return (
    <div className="tray-preview">
      {/* Mounted only while open (no video decoding behind a hidden window), and re-keyed so it
          rejoins the loop where the desktop is each time. */}
      {open && <Art key={`${now.wallpaper.id}:${now.startedAtMs}`} w={now.wallpaper} startedAtMs={now.startedAtMs} paused={paused} small />}
      <div className="tray-preview-shade" />
      <div className="tray-preview-label">
        <span className="tray-name">{now.wallpaper.name}</span>
        {paused && <span className="tray-preview-paused">{now.held ? 'Paused' : `Paused · ${now.paused}`}</span>}
      </div>
    </div>
  );
}

function Controls({ snap }: { snap: TraySnapshot }) {
  const live = snap.now !== null;
  const canStep = snap.queue.size > (live ? 1 : 0);
  return (
    <div className="tray-controls" role="toolbar" aria-label="Playback">
      <IconButton label="Start over" disabled={!live} onClick={() => send({ type: 'restart' })}>
        <ArrowClockwise size={19} weight="bold" />
      </IconButton>
      <IconButton label="Previous" disabled={!canStep} onClick={() => send({ type: 'previous' })}>
        <Rewind size={21} weight="fill" />
      </IconButton>
      <IconButton label={snap.now?.held ? 'Play' : 'Pause'} disabled={!live} onClick={() => send({ type: 'pause' })}>
        {snap.now?.held ? <Play size={22} weight="fill" /> : <Pause size={22} weight="fill" />}
      </IconButton>
      <IconButton label="Next" disabled={!canStep} onClick={() => send({ type: 'next' })}>
        <FastForward size={21} weight="fill" />
      </IconButton>
      <IconButton label="Shuffle" pressed={snap.shuffle} onClick={() => send({ type: 'shuffle' })}>
        <Shuffle size={19} weight="bold" />
      </IconButton>
    </div>
  );
}

function IconButton({ label, disabled, pressed, onClick, children }: { label: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="tray-icon" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function Item({
  children,
  onClick,
  more,
  value,
  checked,
  shortcut,
  disabled,
  thumb,
}: {
  children: ReactNode;
  onClick: () => void;
  more?: boolean;
  value?: string;
  checked?: boolean;
  shortcut?: string;
  disabled?: boolean;
  thumb?: TrayItem;
}) {
  return (
    <button type="button" className="tray-item" disabled={disabled} onClick={onClick} role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked}>
      {thumb && (
        <span className="tray-thumb">
          <Art w={thumb.wallpaper} still />
        </span>
      )}
      <span className="tray-item-label">{children}</span>
      {value && <span className="tray-item-value">{value}</span>}
      {shortcut && <span className="tray-item-value">{shortcut}</span>}
      {checked && <Check size={13} weight="bold" className="tray-check" />}
      {more && <CaretRight size={13} weight="bold" className="tray-more" />}
    </button>
  );
}

function Stat({ children }: { children: ReactNode }) {
  return <div className="tray-stat">{children}</div>;
}

function Sep() {
  return <div className="tray-sep" role="separator" />;
}

createRoot(document.getElementById('root')!).render(<Tray />);
