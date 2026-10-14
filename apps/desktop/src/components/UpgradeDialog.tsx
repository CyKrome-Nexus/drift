import { useEffect, useRef, useState } from 'react';
import { CheckCircle, CircleNotch, CrownSimple } from '@phosphor-icons/react';
import { detectPlatform, formatPrice, purchaseSurface, type Offering } from '@cykrome/sdk';
import { PRO_FEATURES } from '@drift/core';
import { buyPlan, loadPlans, messageOf, openProPage, refreshPlan, type Plans } from '../lib/account';
import { openSettings, setState, toast, useApp } from '../lib/store';
import { FEATURE_ICONS } from './featureIcons';

const PHONE_KEY = 'drift.checkout.phone';

const savedPhone = () => {
  try {
    return localStorage.getItem(PHONE_KEY) ?? '';
  } catch {
    return '';
  }
};

/** The CyKrome rule (@cykrome/sdk): phones send buyers to the website, the desktop lists the plans. */
const SELLS_IN_APP = purchaseSurface(detectPlatform()) === 'plans';

export function UpgradeDialog() {
  const { open, feature } = useApp((s) => s.upgrade);
  const signedIn = useApp((s) => s.account.status === 'signedIn');
  const close = () => setState({ upgrade: { open: false, feature: null } });

  const [plans, setPlans] = useState<Plans | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [phone, setPhone] = useState(savedPhone);
  const [paying, setPaying] = useState<string | null>(null);
  const waiting = useRef<AbortController | null>(null);

  // Coming back from the browser after buying is the moment the plan most likely changed.
  useEffect(() => {
    if (!open || !signedIn) return;
    const onFocus = () => void refreshPlan();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, signedIn]);

  useEffect(() => {
    if (!open || !signedIn || !SELLS_IN_APP) return;
    let live = true;
    setPlansError(null);
    loadPlans()
      .then((p) => live && setPlans(p))
      .catch((err) => live && setPlansError(messageOf(err)));
    return () => {
      live = false;
      waiting.current?.abort();
    };
  }, [open, signedIn]);

  if (!open) return null;
  const reason = PRO_FEATURES.find((f) => f.id === feature);
  const offerings = plans?.storefront.offerings ?? [];
  const requiresPhone = !!plans?.storefront.requiresPhone;
  const loadingPlans = signedIn && SELLS_IN_APP && !plans && !plansError;

  async function buy(o: Offering) {
    const number = phone.trim();
    if (requiresPhone && !number) return toast('Enter your phone number to pay', 'info');
    if (number) {
      try { localStorage.setItem(PHONE_KEY, number); } catch { /* not remembered */ }
    }
    const controller = new AbortController();
    waiting.current = controller;
    setPaying(o.id);
    try {
      const purchase = await buyPlan(o.id, number || undefined, controller.signal);
      if (purchase.status === 'active') {
        toast('Drift Pro is on your account');
        close();
      } else if (purchase.status === 'pending' && !controller.signal.aborted) {
        toast('Still waiting for the payment — Drift updates when it goes through', 'info');
      }
    } catch (err) {
      toast(messageOf(err), 'info');
    } finally {
      setPaying(null);
    }
  }

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

        {offerings.length > 0 && (
          <div className="plans" aria-label="Drift Pro plans">
            {requiresPhone && (
              <label className="plan-phone">
                <span className="feature-detail">Phone number, for the payment</span>
                <input className="input" type="tel" autoComplete="tel" placeholder="+91 99000 00000" value={phone} disabled={paying !== null} onChange={(e) => setPhone(e.target.value)} />
              </label>
            )}
            {offerings.map((o) => (
              <div key={o.id} className="plan">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="feature-title">{o.title}</div>
                  <div className="feature-detail">{o.kind === 'subscription' ? 'Renews until you cancel' : 'Pay once, keep it'}</div>
                </div>
                <span className="plan-price">{formatPrice(o)}</span>
                <button type="button" className="btn btn-glass-accent" style={{ padding: '6px 12px' }} disabled={paying !== null} onClick={() => void buy(o)}>
                  {paying === o.id ? <><CircleNotch className="spin" />Waiting…</> : o.kind === 'subscription' ? 'Subscribe' : 'Buy'}
                </button>
              </div>
            ))}
            {paying && (
              <p className="feature-detail" role="status" style={{ margin: 0 }}>
                Finish paying in your browser. Pro unlocks here as soon as the payment goes through.{' '}
                <button type="button" className="plan-stop" onClick={() => waiting.current?.abort()}>Stop waiting</button>
              </p>
            )}
          </div>
        )}
        {plansError && <p className="feature-detail" role="alert" style={{ margin: 0 }}>Could not load plans: {plansError}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>Not now</button>
          {!signedIn ? (
            <button type="button" className="btn btn-glass-accent" style={{ padding: '7px 14px' }} onClick={() => { close(); openSettings('Account'); }}>
              Sign in to upgrade
            </button>
          ) : offerings.length > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={() => void openProPage()}>View on website</button>
          ) : (
            // Payments off, plans unavailable, or a phone: Pro is bought on the website.
            <button type="button" className="btn btn-glass-accent" style={{ padding: '7px 14px' }} disabled={loadingPlans} onClick={() => void openProPage()}>
              {loadingPlans ? <><CircleNotch className="spin" />Loading plans…</> : <><CrownSimple weight="fill" />View on website</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
