import { useState } from 'react';
import { ArrowClockwise, ArrowsClockwise, CheckCircle, CircleNotch, CloudSlash, CrownSimple, Lock, SignOut } from '@phosphor-icons/react';
import { displayName, initials, planLine, type SyncStatus } from '@drift/account';
import { LINKS, PRO_FEATURES } from '@drift/core';
import { FEATURE_ICONS } from '../components/featureIcons';
import { buyPro, messageOf, refreshPlan, requestCode, signInWithCode, signInWithPassword, signOut, signUp, syncNow } from '../lib/account';
import { openExternal } from '../lib/platform';
import { showUpgrade, useApp } from '../lib/store';
import { Group } from './controls';

type Mode = 'password' | 'code' | 'signup';

function SignIn() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', username: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const profileOk = profile.firstName.trim() && profile.lastName.trim() && /^[A-Za-z0-9_.-]{3,30}$/.test(profile.username.trim());

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
    if (mode === 'signup') {
      if (!profileOk) return;
      void run(async () => {
        await signUp({
          email: email.trim(),
          username: profile.username.trim(),
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          password: password || undefined,
        });
        // CDS emails a code to verify the address; entering it also signs in.
        setMode('code');
        setCodeSent(true);
        setPassword('');
        setNotice('Account created. Enter the code we emailed you to verify it and sign in.');
      });
    } else if (mode === 'password') void run(() => signInWithPassword(email, password));
    else if (!codeSent) void run(async () => { await requestCode(email); setCodeSent(true); });
    else void run(() => signInWithCode(email, code));
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
    setCodeSent(false);
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
          <button type="button" className="about-link" style={{ alignSelf: 'flex-start' }} onClick={() => switchMode('signup')}>Create a CyKrome Account</button>
        </div>
      </div>
      <form className="signin-form" onSubmit={submit}>
        <div className="seg-plain" role="tablist" style={{ alignSelf: 'flex-start' }}>
          {(['password', 'code', 'signup'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} aria-pressed={mode === m} className="seg-opt-btn" onClick={() => switchMode(m)}>
              {{ password: 'Password', code: 'Email code', signup: 'Create account' }[m]}
            </button>
          ))}
        </div>
        {mode === 'signup' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label htmlFor="acct-first">First name</label>
              <input id="acct-first" className="input" autoComplete="given-name" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="acct-last">Last name</label>
              <input id="acct-last" className="input" autoComplete="family-name" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="acct-username">Username</label>
              <input id="acct-username" className="input" autoComplete="username" value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="acct-email">Email</label>
          <input id="acct-email" className="input" type="email" autoComplete="email" value={email} disabled={codeSent} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {(mode === 'password' || mode === 'signup') && (
          <div className="field">
            <label htmlFor="acct-password">{mode === 'signup' ? 'Password (optional)' : 'Password'}</label>
            <input id="acct-password" className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <span className="srow-desc" style={{ fontSize: 12 }}>Leave it empty to always sign in with an emailed code.</span>}
          </div>
        )}
        {mode === 'code' && codeSent && (
          <div className="field">
            <label htmlFor="acct-code">Code from your email</label>
            <input id="acct-code" className="input mono" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        {notice && !error && <span className="srow-desc" role="status">{notice}</span>}
        {error && <span className="error-text" role="alert">{error}</span>}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ padding: '8px 14px' }}
          disabled={busy || !emailOk || (mode === 'password' && !password) || (mode === 'signup' && !profileOk) || (mode === 'code' && codeSent && code.trim().length < 4)}
        >
          {busy && <CircleNotch className="spin" />}
          {mode === 'signup' ? 'Create account' : mode === 'password' ? 'Sign in' : codeSent ? 'Verify and sign in' : 'Email me a code'}
        </button>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          {mode === 'password' && <button type="button" className="about-link" onClick={() => void openExternal(LINKS.account)}>Forgot password?</button>}
          {codeSent && <button type="button" className="about-link" onClick={() => { setCodeSent(false); setCode(''); setNotice(''); }}>Use a different email</button>}
        </div>
      </form>
    </div>
  );
}

function syncLine(sync: SyncStatus): string {
  if (sync.state === 'syncing') return 'Syncing…';
  if (sync.state === 'error') return `Could not sync: ${sync.error}`;
  if (!sync.lastSyncedAt) return 'Not synced yet';
  const mins = Math.round((Date.now() - sync.lastSyncedAt) / 60_000);
  return mins < 1 ? 'Synced just now' : `Synced ${mins} min ago`;
}

function SignedIn() {
  const { user, plan, planError, offline, sync } = useApp((s) => s.account);
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
        {offline && (
          <span className="tag tag-neutral" title="CyKrome could not be reached. Drift is using your saved account and plan.">
            <CloudSlash />Offline
          </span>
        )}
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
        <div className="srow" style={{ boxShadow: 'inset 0 1px 0 var(--color-neutral-800)' }}>
          <div className="srow-text">
            <span className="srow-label">Sync favourites and lists</span>
            <span className={sync.state === 'error' ? 'srow-desc error-text' : 'srow-desc'}>
              {isPro ? syncLine(sync) : 'Part of Drift Pro'}
            </span>
          </div>
          {isPro ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={sync.state === 'syncing' || offline} onClick={() => void syncNow()}>
              <ArrowsClockwise className={sync.state === 'syncing' ? 'spin' : undefined} />Sync now
            </button>
          ) : (
            <Lock size={14} color="var(--color-neutral-500)" />
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
