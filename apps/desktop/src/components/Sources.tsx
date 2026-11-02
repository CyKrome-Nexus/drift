import { useEffect, useState } from 'react';
import { ArrowSquareOut, CheckCircle, Key, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { KEY_PROVIDERS, verifyKey, type KeyProviderInfo } from '@drift/wallpapers';
import { setKey, useKeys } from '../lib/catalog';
import { openExternal, systemInfo } from '../lib/platform';
import { toast } from '../lib/store';

/** Where the keys are kept, in the words the OS uses. */
function useVaultName(): string {
  const [name, setName] = useState('your system’s credential store');
  useEffect(() => {
    let live = true;
    void systemInfo().then((s) => {
      if (!live) return;
      setName(s.os === 'macos' ? 'your Mac’s Keychain' : s.os === 'windows' ? 'Windows Credential Manager' : s.os === 'linux' ? 'your keyring' : 'this browser');
    });
    return () => {
      live = false;
    };
  }, []);
  return name;
}

function ProviderCard({ p, connected }: { p: KeyProviderInfo; connected: boolean }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const check = await verifyKey(p.name, value, (url, init) => fetch(url, init));
    if (check === 'invalid') {
      setError(`${p.label} didn’t accept that key. Copy it again from the ${p.label} page.`);
    } else {
      try {
        await setKey(p.name, value);
        setValue('');
        // Offline or rate limited: saved anyway, it will be used once Pexels/Pixabay answers.
        toast(check === 'ok' ? `${p.label} connected` : `${p.label} key saved · couldn’t reach ${p.label} to check it`, check === 'ok' ? 'ok' : 'info');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setBusy(false);
  };

  return (
    <div className="source-card">
      <div className="source-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="source-name">{p.label}</span>
          <span className="srow-desc">{p.what}</span>
          <span className="srow-desc">{p.limits}</span>
        </div>
        {connected ? (
          <span className="source-status is-on"><CheckCircle weight="fill" />Connected</span>
        ) : (
          <span className="source-status"><Key />No key</span>
        )}
      </div>

      {connected ? (
        <div className="source-row">
          <span className="srow-desc" style={{ flex: 1 }}>Your key is saved. Wallpapers from {p.label} use it.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void setKey(p.name, null).then(() => toast(`${p.label} key removed`, 'info'))}>
            Remove key
          </button>
        </div>
      ) : (
        <>
          <ol className="source-steps">
            {p.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="source-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExternal(p.keyUrl)}>
              <ArrowSquareOut />Get a free key
            </button>
            <form
              style={{ display: 'flex', gap: 6, flex: 1 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (value.trim() && !busy) void save();
              }}
            >
              <input
                className="input"
                style={{ flex: 1 }}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={`Paste your ${p.label} API key`}
                aria-label={`${p.label} API key`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!value.trim() || busy}>{busy ? 'Checking…' : 'Save'}</button>
            </form>
          </div>
          {error && <span className="source-error"><WarningCircle weight="fill" />{error}</span>}
        </>
      )}
    </div>
  );
}

/** Each keyed provider with its status, how to get a key, and where the key is kept. */
export function Sources() {
  const keys = useKeys();
  const vault = useVaultName();
  return (
    <div className="sources">
      {KEY_PROVIDERS.map((p) => <ProviderCard key={p.name} p={p} connected={keys[p.name]} />)}
      <p className="source-note">
        <ShieldCheck weight="fill" />
        Keys are free and yours: they stay in {vault}, are sent only to their own provider, and every request counts against your own
        free allowance. Drift doesn’t ship with any keys and never sees yours.
      </p>
    </div>
  );
}
