import type { ReactNode } from 'react';
import { CrownSimple } from '@phosphor-icons/react';
import { isProOption, type DesktopSettings } from '@drift/core';
import { requirePro } from '../lib/account';
import { updateSettings, useApp } from '../lib/store';

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="group">
      <span className="group-title">{title}</span>
      <div className="group-box">{children}</div>
    </div>
  );
}

export function Row({ label, desc, children, pro }: { label: ReactNode; desc?: ReactNode; children?: ReactNode; pro?: boolean }) {
  return (
    <div className="srow">
      <div className="srow-text">
        <span className="srow-label">{label}{pro && <ProPill />}</span>
        {desc && <span className="srow-desc">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

export function ProPill() {
  return <span className="pro-pill"><CrownSimple size={9} weight="fill" />Pro</span>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)} />;
}

type BoolKey = { [K in keyof DesktopSettings]: DesktopSettings[K] extends boolean ? K : never }[keyof DesktopSettings];
type ChoiceKey = 'fps' | 'quality' | 'monitors' | 'scale';

export function SettingToggle({ k, label, desc }: { k: BoolKey; label: string; desc: string }) {
  const on = useApp((s) => s.settings[k]);
  return (
    <Row label={label} desc={desc}>
      <Toggle on={on} label={label} onChange={(v) => updateSettings({ [k]: v })} />
    </Row>
  );
}

/** A segmented choice. Options that are Pro-only show a crown and open the upgrade sheet on free plans. */
export function SettingChoice<K extends ChoiceKey>({ k, label, desc, options }: { k: K; label: string; desc: string; options: ReadonlyArray<DesktopSettings[K]> }) {
  const value = useApp((s) => s.settings[k]);
  const isPro = useApp((s) => s.account.plan.plan === 'pro');
  const hasPro = options.some((o) => isProOption(k, o));
  return (
    <Row label={label} desc={desc} pro={hasPro && !isPro}>
      <div className="seg-plain" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const locked = !isPro && isProOption(k, o);
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={value === o}
              aria-pressed={value === o}
              className="seg-opt-btn"
              onClick={() => {
                if (locked && !requirePro.feature(k === 'fps' ? 'unlimitedFrameRate' : 'multiDisplay')) return;
                updateSettings({ [k]: o } as Partial<DesktopSettings>);
              }}
            >
              {locked && <CrownSimple size={10} weight="fill" color="var(--color-accent-300)" />}
              {o}
            </button>
          );
        })}
      </div>
    </Row>
  );
}
