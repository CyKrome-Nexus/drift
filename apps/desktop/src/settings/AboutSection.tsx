// Settings › About, after Aperture's: identity, quick actions, updates, the build ledger, and
// the CyKrome Nexus publisher block.

import { useEffect, useState } from 'react';
import { ArrowClockwise, BookOpen, Check, CircleNotch, Copy, DownloadSimple, PaperPlaneTilt } from '@phosphor-icons/react';
import { LINKS, PRODUCT, PUBLISHER, legalLine } from '@drift/core';
import { displayName } from '@drift/account';
import { APP_VERSION, inTauri, openExternal, platformLabel, systemInfo, type SystemInfo } from '../lib/platform';
import { setState, useApp, type UpdatePrefs } from '../lib/store';
import { checkForUpdates, downloadAndInstall, restart, useUpdater } from '../lib/updater';
import { MailFounder } from './MailFounder';

const UPDATE_MODES: Array<{ mode: UpdatePrefs['mode']; title: string; tag: string; line: string }> = [
  { mode: 'auto', title: 'Install automatically', tag: 'Hands-off', line: 'Download in the background and apply on the next launch.' },
  { mode: 'notify', title: 'Ask before installing', tag: 'Default', line: 'Tell me when a version is ready, and wait for a click.' },
  { mode: 'manual', title: 'Only when I check', tag: 'Manual', line: 'Never look for updates on my behalf.' },
];

function Updates() {
  const u = useUpdater();
  const prefs = useApp((s) => s.updatePrefs);
  const busy = u.phase === 'checking' || u.phase === 'downloading';
  const setPrefs = (p: Partial<UpdatePrefs>) => setState((s) => ({ updatePrefs: { ...s.updatePrefs, ...p } }));

  const head = {
    idle: 'Signed releases from the CyKrome Nexus channel',
    checking: 'Checking…',
    uptodate: 'Up to date',
    available: `Version ${u.newVersion} is available`,
    downloading: `Downloading ${u.newVersion}…${u.total ? ` ${Math.round((u.received / u.total) * 100)}%` : ''}`,
    ready: `Version ${u.newVersion} installed — restart to apply`,
    error: 'Update check failed',
  }[u.phase];

  const dot = u.phase === 'error' ? 'is-error' : busy ? 'is-busy' : u.phase === 'available' || u.phase === 'ready' ? 'is-available' : u.phase === 'uptodate' ? 'is-ok' : '';

  return (
    <section className="about-sec">
      <h5>Updates</h5>
      <div className="about-update">
        <div className="about-update-line">
          <span className={`about-update-dot ${dot}`} />
          <div className="about-update-text">
            <div className="about-update-head">{head}</div>
            {u.phase === 'error' ? (
              <div className="about-update-sub error-text">{u.error || 'The release server did not respond.'}</div>
            ) : (
              <div className="about-update-sub">Installed <span className="mono">{u.currentVersion}</span></div>
            )}
          </div>
          <div className="about-update-btns">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void checkForUpdates()}>
              {u.phase === 'checking' ? <CircleNotch className="spin" /> : <ArrowClockwise />}
              {u.phase === 'checking' ? 'Checking…' : 'Check now'}
            </button>
            {u.phase === 'available' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void downloadAndInstall()}><DownloadSimple />Install {u.newVersion}</button>
            )}
            {u.phase === 'ready' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void restart()}><ArrowClockwise />Restart</button>
            )}
          </div>
        </div>
        {u.notes && (u.phase === 'available' || u.phase === 'ready') && (
          <div className="about-notes">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Release notes · {u.newVersion}</div>
            {u.notes}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Update preferences</div>
        <div className="srow-desc" style={{ margin: '2px 0 10px' }}>Choose how Drift handles updates.</div>
        <div className="radio-box" role="radiogroup" aria-label="Update preferences">
          {UPDATE_MODES.map((o) => (
            <button key={o.mode} type="button" role="radio" aria-checked={prefs.mode === o.mode} className="radio-row" onClick={() => setPrefs({ mode: o.mode })}>
              <span className="radio-head">
                <span className="radio-dot" />
                <span style={{ fontWeight: 600 }}>{o.title}</span>
                <span className={`tag ${o.mode === 'notify' ? 'tag-accent' : 'tag-neutral'}`} style={{ marginLeft: 'auto', padding: '1px 8px' }}>{o.tag}</span>
              </span>
              <span className="radio-sub">{o.line}</span>
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginTop: 14 }}>
          <input type="checkbox" checked={prefs.checkOnStartup} disabled={prefs.mode === 'manual'} onChange={(e) => setPrefs({ checkOnStartup: e.target.checked })} style={{ accentColor: 'var(--color-accent)', marginTop: 3 }} />
          <span>
            <span style={{ fontSize: 13, display: 'block' }}>Check for updates on startup</span>
            <span className="srow-desc">Look for updates shortly after Drift launches.</span>
          </span>
        </label>
      </div>
    </section>
  );
}

export function AboutSection() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const account = useApp((s) => s.account);
  const settings = useApp((s) => s.settings);

  useEffect(() => {
    void systemInfo().then(setInfo);
  }, []);

  const platform = info ? platformLabel(info.os) : '…';
  const accountLine =
    account.status === 'signedIn' && account.user
      ? `${displayName(account.user)} · ${account.plan.plan === 'pro' ? 'Drift Pro' : 'Drift Free'}`
      : 'Not signed in';

  const diagnostics = () =>
    [
      `Drift ${APP_VERSION}`,
      `Platform: ${platform} (${info?.os ?? '?'} ${info?.arch ?? '?'})`,
      `Shell: ${inTauri ? `Tauri ${info?.tauri}` : 'Browser preview'}`,
      `Plan: ${account.plan.plan}`,
      `Playback: ${settings.fps} fps · ${settings.quality} · ${settings.monitors} · ${settings.scale}`,
    ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied: nothing to report beyond the button not flipping.
    }
  };

  return (
    <div className="about">
      <div className="about-id">
        <span className="about-mark"><span className="brand-mark" /></span>
        <div className="about-id-text">
          <h4 className="about-name">{PRODUCT.name}</h4>
          <p className="about-blurb">{PRODUCT.blurb}</p>
        </div>
        <div className="about-id-meta">
          <span className="mono about-ver">{APP_VERSION}</span>
          <span className="about-plat">{platform}</span>
        </div>
      </div>

      <div className="about-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExternal(LINKS.docs)}><BookOpen />Documentation</button>
        <button type="button" className="btn btn-secondary btn-sm" title="Copy version, platform and engine details to the clipboard" onClick={() => void copy()}>
          {copied ? <Check className="ok" /> : <Copy />}{copied ? 'Copied' : 'Copy diagnostics'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMailOpen(true)}><PaperPlaneTilt />Mail to Founder</button>
      </div>

      <Updates />

      <section className="about-sec">
        <h5>Build</h5>
        <dl className="ledger">
          <div><dt>Version</dt><dd className="mono">{APP_VERSION}</dd></div>
          <div><dt>Platform</dt><dd className="mono">{platform} · {info?.arch ?? '…'}</dd></div>
          {info?.engine ? (
            <div><dt>Wallpaper engine</dt><dd className="mono">Desktop layer · {platform}</dd><dd className="note">One window per display, behind your icons and on every Space</dd></div>
          ) : (
            <div><dt>Wallpaper engine</dt><dd className="mono">Preview</dd><dd className="note">The native desktop layer is not built for {platform} yet; loops play inside Drift only</dd></div>
          )}
          <div><dt>Shell</dt><dd className="mono">{inTauri ? `Tauri ${info?.tauri ?? '2'}` : 'Browser preview'}</dd><dd className="note">Native window, drawn chrome and system integration</dd></div>
          <div><dt>Interface</dt><dd className="mono">React 19</dd><dd className="note">Shares its catalog, plans and account client with Drift for phone</dd></div>
          <div><dt>Theme</dt><dd className="mono">Nocturne · OKLCH</dd><dd className="note">Dark, with the CyKrome Nexus blurple accent</dd></div>
          <div><dt>Account</dt><dd className="mono">CyKrome Account</dd><dd className="note">{accountLine}</dd></div>
          <div><dt>Storage</dt><dd className="mono">Local</dd><dd className="note">Settings, favourites and lists stay on this machine</dd></div>
          <div><dt>Telemetry</dt><dd className="mono ok">None</dd><dd className="note">No usage data leaves this machine</dd></div>
        </dl>
      </section>

      <section className="about-sec">
        <div className="about-sec-head">
          <img src="/cykrome-logo.png" alt="" />
          <h3>CyKrome Nexus</h3>
        </div>
        <p className="about-prose">{PUBLISHER.prose}</p>
        <dl className="ledger">
          {PUBLISHER.links.map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd>{'prefix' in l ? l.prefix : ''}<button type="button" className="about-link" onClick={() => void openExternal(l.href)}>{l.text}</button></dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="about-legal">
        <span>{legalLine()}</span>
        <button type="button" className="about-link" onClick={() => void openExternal(LINKS.privacy)}>Privacy</button>
        <button type="button" className="about-link" onClick={() => void openExternal(LINKS.terms)}>Terms</button>
      </p>

      {mailOpen && <MailFounder platform={platform} onClose={() => setMailOpen(false)} />}
    </div>
  );
}
