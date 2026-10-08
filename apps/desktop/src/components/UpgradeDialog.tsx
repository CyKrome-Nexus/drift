import { useEffect } from 'react';
import { CheckCircle, CrownSimple } from '@phosphor-icons/react';
import { PRO_FEATURES } from '@drift/core';
import { buyPro, refreshPlan } from '../lib/account';
import { openSettings, setState, useApp } from '../lib/store';
import { FEATURE_ICONS } from './featureIcons';

export function UpgradeDialog() {
  const { open, feature } = useApp((s) => s.upgrade);
  const signedIn = useApp((s) => s.account.status === 'signedIn');
  const close = () => setState({ upgrade: { open: false, feature: null } });

  // Coming back from the browser after buying is the moment the plan most likely changed.
  useEffect(() => {
    if (!open || !signedIn) return;
    const onFocus = () => void refreshPlan();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, signedIn]);

  if (!open) return null;
  const reason = PRO_FEATURES.find((f) => f.id === feature);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="dialog upgrade" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <div className="upgrade-hero">
          <span className="tag tag-accent" style={{ gap: 5 }}><CrownSimple weight="fill" />Drift Pro</span>
          <div className="dialog-title" id="upgrade-title" style={{ marginTop: 10 }}>
            {reason ? `${reason.title} is part of Drift Pro` : 'Get more from Drift'}
          </div>
          <p className="dialog-body" style={{ margin: '4px 0 0' }}>
            Pro is tied to your CyKrome Account, so it unlocks on every device you sign in to.
          </p>
        </div>
        <div>
          {PRO_FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f.id];
            return (
              <div key={f.id} className="feature" style={f.id === feature ? { color: 'var(--color-accent-200)' } : undefined}>
                <Icon size={17} color="var(--color-accent)" style={{ marginTop: 2, flex: 'none' }} />
                <div style={{ flex: 1 }}>
                  <div className="feature-title">{f.title}{f.soon && <span className="tag tag-neutral" style={{ marginLeft: 6, padding: '0 6px', fontSize: 10 }}>Soon</span>}</div>
                  <div className="feature-detail">{f.detail}</div>
                </div>
                {f.id === feature && <CheckCircle size={15} weight="fill" color="var(--color-accent)" />}
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>Not now</button>
          {signedIn ? (
            <button type="button" className="btn btn-glass-accent" style={{ padding: '7px 14px' }} onClick={() => void buyPro()}>
              <CrownSimple weight="fill" />Get Drift Pro
            </button>
          ) : (
            <button type="button" className="btn btn-glass-accent" style={{ padding: '7px 14px' }} onClick={() => { close(); openSettings('Account'); }}>
              Sign in to upgrade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
