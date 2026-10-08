import { useState } from 'react';
import { ArrowClockwise, CheckCircle, CircleNotch, CrownSimple, Lock, SignOut } from '@phosphor-icons/react';
import { displayName, initials, planLine } from '@drift/account';
import { LINKS, PRO_FEATURES } from '@drift/core';
import { FEATURE_ICONS } from '../components/featureIcons';
import { messageOf, proProductConfigured, refreshPlan, requestCode, signInWithCode, signInWithPassword, signOut } from '../lib/account';
import { openExternal } from '../lib/platform';
import { showUpgrade, useApp } from '../lib/store';
import { Group } from './controls';

type Mode = 'password' | 'code';

function SignIn() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOk || busy) return;
    if (mode === 'password') void run(() => signInWithPassword(email.trim(), password));
    else if (!codeSent) void run(async () => { await requestCode(email.trim()); setCodeSent(true); });
    else void run(() => signInWithCode(email.trim(), code.trim()));
  };

  return (
    <div className="group-box signin">
      <div className="signin-pitch">
        <span className="brand-mark" style={{ width: 28, height: 28, borderRadius: 8 }} />
        <h4 style={{ margin: '6px 0 0', fontSize: 19 }}>Sign in with your CyKrome Account</h4>
        <p className="srow-desc" style={{ margin: 0, fontSize: 13 }}>
          One account across every CyKrome Nexus app. Sign in to unlock Drift Pro on this device if your account
          has it.
        </p>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
          <span className="text-muted">No account yet?</span>
          <button type="button" className="about-link" style={{ alignSelf: 'flex-start' }} onClick={() => void openExternal(LINKS.signUp)}>Create a CyKrome Account</button>
        </div>
      </div>
      <form className="signin-form" onSubmit={submit}>
        <div className="seg-plain" role="tablist" style={{ alignSelf: 'flex-start' }}>
          {(['password', 'code'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} aria-pressed={mode === m} className="seg-opt-btn" onClick={() => { setMode(m); setError(''); setCodeSent(false); }}>
              {m === 'password' ? 'Password' : 'Email code'}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="acct-email">Email</label>
          <input id="acct-email" className="input" type="email" autoComplete="email" value={email} disabled={codeSent} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode === 'password' && (
          <div className="field">
            <label htmlFor="acct-password">Password</label>
            <input id="acct-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {mode === 'code' && codeSent && (
          <div className="field">
            <label htmlFor="acct-code">Code from your email</label>
            <input id="acct-code" className="input mono" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        {error && <span className="error-text" role="alert">{error}</span>}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ padding: '8px 14px' }}
          disabled={busy || !emailOk || (mode === 'password' && !password) || (mode === 'code' && codeSent && code.trim().length < 4)}
        >
          {busy && <CircleNotch className="spin" />}
          {mode === 'password' ? 'Sign in' : codeSent ? 'Verify and sign in' : 'Email me a code'}
        </button>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          {mode === 'password' && <button type="button" className="about-link" onClick={() => void openExternal(LINKS.account)}>Forgot password?</button>}
          {codeSent && <button type="button" className="about-link" onClick={() => { setCodeSent(false); setCode(''); }}>Use a different email</button>}
        </div>
      </form>
    </div>
  );
}

function SignedIn() {
  const { user, plan, planError } = useApp((s) => s.account);
  const [refreshing, setRefreshing] = useState(false);
  if (!user) return null;
  const isPro = plan.plan === 'pro';

  return (
    <>
      <div className="group-box acct-card">
        <span className="acct-avatar">{initials(user)}</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{displayName(user)}</span>
          <span className="srow-desc">{user.email}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExternal(LINKS.account)}>Manage account</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}><SignOut />Sign out</button>
      </div>

      <Group title="Subscription">
        <div className="srow">
          <div className="srow-text">
            <span className="srow-label" style={{ fontSize: 16 }}>
              {isPro && <CrownSimple weight="fill" color="var(--color-accent)" />}
              {isPro ? 'Drift Pro' : 'Drift Free'}
            </span>
            <span className="srow-desc">{planLine(plan)}{planError && <> · <span className="error-text">{planError}</span></>}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={refreshing}
            onClick={async () => { setRefreshing(true); await refreshPlan(); setRefreshing(false); }}
            title="Check CyKrome for plan changes"
          >
            <ArrowClockwise className={refreshing ? 'spin' : undefined} />Refresh
          </button>
          {isPro ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExternal(LINKS.pro)}>Manage subscription</button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => showUpgrade()}><CrownSimple weight="fill" />Upgrade</button>
          )}
        </div>
        <div className="feature-list" style={{ boxShadow: 'inset 0 1px 0 var(--color-neutral-800)' }}>
          {PRO_FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f.id];
            return (
              <div key={f.id} className="feature">
                <Icon size={17} color="var(--color-accent)" style={{ marginTop: 2, flex: 'none' }} />
                <div style={{ flex: 1 }}>
                  <div className="feature-title">{f.title}{f.soon && <span className="tag tag-neutral" style={{ marginLeft: 6, padding: '0 6px', fontSize: 10 }}>Soon</span>}</div>
                  <div className="feature-detail">{f.detail}</div>
                </div>
                {isPro ? <CheckCircle size={15} weight="fill" className="ok" /> : <Lock size={14} color="var(--color-neutral-500)" />}
              </div>
            );
          })}
        </div>
      </Group>
      {!proProductConfigured && (
        <p className="srow-desc" style={{ margin: 0 }}>
          Build note: <span className="mono">VITE_DRIFT_PRO_PRODUCT_ID</span> is not set, so every account reads as Drift Free.
        </p>
      )}
    </>
  );
}

export function AccountSection() {
  const status = useApp((s) => s.account.status);
  if (status === 'restoring') {
    return <div className="empty" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><CircleNotch className="spin" />Checking your CyKrome session…</div>;
  }
  return status === 'signedIn' ? <SignedIn /> : <SignIn />;
}
