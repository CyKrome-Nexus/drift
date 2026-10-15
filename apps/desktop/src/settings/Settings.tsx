import { useEffect, useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  CrownSimple,
  Gauge,
  HardDrives,
  Info,
  Monitor,
  PlayCircle,
  SlidersHorizontal,
  UserCircle,
  type IconProps,
} from '@phosphor-icons/react';
import { planLine } from '@drift/account';
import { stop } from '../lib/actions';
import { displayLabel, listDisplays, type Display } from '../lib/platform';
import { back, openSettings, showUpgrade, toast, useApp, type Section } from '../lib/store';
import { AboutSection } from './AboutSection';
import { AccountSection } from './AccountSection';
import { Group, Row, SettingChoice, SettingToggle } from './controls';

const NAV: Array<[Section, ComponentType<IconProps>]> = [
  ['General', SlidersHorizontal],
  ['Playback', PlayCircle],
  ['Performance', Gauge],
  ['Displays', Monitor],
  ['Library & storage', HardDrives],
  ['Account', UserCircle],
  ['About', Info],
];

const HEADINGS: Record<Section, [string, string]> = {
  General: ['General', 'Changes apply instantly to every running wallpaper.'],
  Playback: ['Playback', 'When loops play, pause, and how fast.'],
  Performance: ['Performance', 'Trade fidelity for battery and GPU headroom.'],
  Displays: ['Displays', 'How wallpapers spread across your screens.'],
  'Library & storage': ['Library & storage', 'Where downloads live and how much space they take.'],
  Account: ['Account', 'Your CyKrome Account and Drift Pro.'],
  About: ['About', 'Version, updates, and who makes Drift.'],
};

function PlanCard() {
  const { status, plan } = useApp((s) => s.account);
  if (status !== 'signedIn') {
    return (
      <button type="button" className="plan-card is-free" onClick={() => openSettings('Account')}>
        <span className="plan-card-title" style={{ color: 'var(--color-text)' }}>Sign in with CyKrome</span>
        <span className="plan-card-sub">Use your CyKrome Account to unlock Drift Pro.</span>
      </button>
    );
  }
  if (plan.plan === 'free') {
    return (
      <button type="button" className="plan-card is-free" onClick={() => showUpgrade()}>
        <span className="plan-card-title"><CrownSimple weight="fill" />Upgrade to Drift Pro</span>
        <span className="plan-card-sub">5K masters, unlimited fps, every display.</span>
      </button>
    );
  }
  return (
    <button type="button" className="plan-card" onClick={() => openSettings('Account')}>
      <span className="plan-card-title"><CrownSimple weight="fill" />Drift Pro</span>
      <span className="plan-card-sub">{planLine(plan)}</span>
    </button>
  );
}

function CurrentWallpaper() {
  const current = useApp((s) => s.current);
  const known = useApp((s) => s.known);
  // A wallpaper this device has not seen (applied elsewhere, cache cleared) still gets a row.
  const named = (id: string) => known[id] ?? { name: 'Wallpaper', publisher: id.split(':')[0] || 'Drift' };
  const [displays, setDisplays] = useState<Display[]>([]);

  // Re-read on every change: a change may be a display plugged in or removed.
  useEffect(() => {
    let live = true;
    if (current) listDisplays().then((d) => live && setDisplays(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, [current]);

  if (!current) {
    return (
      <Group title="Wallpaper">
        <Row label="No wallpaper running" desc="Open any wallpaper and choose Apply." />
      </Group>
    );
  }

  const state = current.paused ? `Paused · ${current.paused}` : 'Playing behind your desktop';
  const remove = <button type="button" className="btn btn-secondary btn-sm" onClick={() => void stop()}>Remove</button>;
  // One row per connected display when they show different wallpapers ("Per display").
  const shown = displays
    .map((d, i) => ({ d, i, a: current.displays.find((a) => a.display === d.id) }))
    .filter((x): x is { d: Display; i: number; a: NonNullable<typeof x.a> } => x.a !== undefined);
  if (new Set(shown.map((x) => x.a.wallpaperId)).size > 1 || (shown.length > 0 && shown.length < displays.length)) {
    return (
      <Group title="Wallpaper">
        {shown.map(({ d, i, a }, n) => {
          const w = named(a.wallpaperId);
          return (
            <Row key={d.id} label={`${displayLabel(d, i)} · ${w.name}`} desc={n === 0 ? `${w.publisher} · ${state}` : w.publisher}>
              {n === 0 && remove}
            </Row>
          );
        })}
      </Group>
    );
  }
  const w = named(current.id);
  return (
    <Group title="Wallpaper">
      <Row label={w.name} desc={`${w.publisher} · ${state}`}>{remove}</Row>
    </Group>
  );
}

function Storage() {
  const dir = useApp((s) => s.settings.downloadDir);
  return (
    <Group title="Library & storage">
      <Row label="Download location" desc={<span className="mono">{dir}</span>}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => toast('Folder picker arrives with downloads', 'info')}>Change…</button>
      </Row>
      <div className="srow">
        <div className="srow-text" style={{ gap: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="srow-label">Cache</span>
            <span className="srow-desc">0 MB of 10 GB</span>
          </div>
          <div className="meter"><div style={{ width: '0%', background: 'var(--color-accent)' }} /></div>
          <div className="legend"><span>● Downloaded 0 MB</span><span>● Previews 0 MB</span></div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled>Clear cache</button>
      </div>
    </Group>
  );
}

function SectionBody({ section }: { section: Section }) {
  switch (section) {
    case 'General':
      return (
        <>
        <CurrentWallpaper />
        <Group title="General">
          <SettingToggle k="launchAtLogin" label="Launch Drift at login" desc="Start hidden and resume your wallpaper." />
          <SettingToggle k="showInTray" label="Show in system tray" desc="Open Drift or remove the wallpaper from the menu bar." />
        </Group>
        </>
      );
    case 'Playback':
      return (
        <Group title="Playback">
          <SettingToggle k="resumeOnStartup" label="Resume last wallpaper on startup" desc="Picks up exactly where the loop left off." />
          <SettingToggle k="pauseFullscreen" label="Pause when an app is fullscreen" desc="Games and video get the whole GPU." />
          <SettingToggle k="pauseOnBattery" label="Pause on battery power" desc="Shows a still frame until you plug in." />
          <SettingToggle k="muteAudio" label="Mute wallpaper audio" desc="Some wallpapers ship with ambient sound." />
          <SettingChoice k="fps" label="Frame rate limit" desc="Higher rates use more power." options={['30', '60', 'Unlimited']} />
        </Group>
      );
    case 'Performance':
      return (
        <Group title="Performance">
          <SettingChoice k="quality" label="Render quality" desc="Balanced halves GPU memory." options={['Low', 'Balanced', 'High']} />
          <SettingToggle k="hardwareAcceleration" label="Hardware acceleration" desc="Decode video on the GPU." />
          <SettingToggle k="pauseHighCpu" label="Pause above 80% CPU" desc="Frees resources during heavy work." />
        </Group>
      );
    case 'Displays':
      return (
        <Group title="Displays">
          <SettingChoice k="monitors" label="Multiple displays" desc="How wallpapers spread across screens." options={['Same', 'Span', 'Per display']} />
          <SettingChoice k="scale" label="Scaling" desc="When the aspect ratio differs." options={['Fill', 'Fit', 'Stretch']} />
        </Group>
      );
    case 'Library & storage':
      return <Storage />;
    case 'Account':
      return <AccountSection />;
    case 'About':
      return <AboutSection />;
  }
}

export function Settings({ section }: { section: Section }) {
  const [title, sub] = HEADINGS[section];
  return (
    <div className="settings">
      <aside className="settings-nav">
        <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start', marginBottom: 18, padding: '4px 8px', color: 'var(--color-neutral-300)' }} onClick={back}>
          <ArrowLeft />Back to Drift
        </button>
        <span className="eyebrow" style={{ fontSize: 10, color: 'var(--color-neutral-500)', padding: '0 10px 6px' }}>Settings</span>
        {NAV.map(([label, Icon]) => (
          <button key={label} type="button" className="nav-item" aria-current={section === label ? 'page' : undefined} onClick={() => openSettings(label)}>
            <Icon size={16} />{label}
          </button>
        ))}
        <PlanCard />
      </aside>
      <main className="settings-body">
        <div className="settings-col">
          <div className="settings-head">
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <SectionBody section={section} />
        </div>
      </main>
    </div>
  );
}
