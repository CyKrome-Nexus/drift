import { useEffect, useState } from 'react';
import { ArrowSquareOut, CheckCircle, Key, Plus, ShieldCheck, Trash, WarningCircle } from '@phosphor-icons/react';
import { CONNECTION_TYPES, defaultName, typeInfo, verifyKey, type ConnectionType } from '@drift/wallpapers';
import { addConnection, removeConnection, renameConnection, replaceKey, useConnections, type ConnectionState } from '../lib/catalog';
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

/** A row not saved yet: it becomes a connection when its key is saved. */
interface Draft {
  draft: string;
  type: ConnectionType;
  name: string;
}

/** Paste a key, check it with the provider, then hand it on. */
function KeyForm({ type, label, onKey }: { type: ConnectionType; label: string; onKey: (key: string, checked: boolean) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = typeInfo(type);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const check = await verifyKey(type, value, (url, init) => fetch(url, init));
    if (check === 'invalid') {
      setError(`${info.label} didn’t accept that key. Copy it again from the ${info.label} page.`);
    } else {
      try {
        // Offline or rate limited: saved anyway, it is used once the provider answers.
        await onKey(value, check === 'ok');
        setValue('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setBusy(false);
  };

  return (
    <>
      <div className="source-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExternal(info.keyUrl)}>
          <ArrowSquareOut />Get a free key
        </button>
        <form
          style={{ display: 'flex', gap: 6, flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() && !busy) void submit();
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={`Paste your ${info.label} API key`}
            aria-label={`API key for ${label}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!value.trim() || busy}>{busy ? 'Checking…' : 'Save'}</button>
        </form>
      </div>
      {error && <span className="source-error"><WarningCircle weight="fill" />{error}</span>}
    </>
  );
}

/** The name, editable in place. Saved connections rename on Enter or when the field loses focus. */
function NameField({ value, type, onCommit, onChange }: { value: string; type: ConnectionType; onCommit?: (name: string) => void; onChange?: (name: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() !== value) onCommit?.(text);
  };
  return (
    <input
      className="source-name-input"
      value={text}
      maxLength={40}
      placeholder={typeInfo(type).label}
      aria-label="Name"
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(value);
      }}
    />
  );
}

function SourceHead({ type, connected, name, onRemove }: { type: ConnectionType; connected: boolean; name: React.ReactNode; onRemove: () => void }) {
  const info = typeInfo(type);
  return (
    <>
      <div className="source-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          {name}
          <span className="srow-desc">{info.label} · {info.limits}</span>
        </div>
        {connected ? (
          <span className="source-status is-on"><CheckCircle weight="fill" />Connected</span>
        ) : (
          <span className="source-status"><Key />No key</span>
        )}
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove this source" title="Remove this source" onClick={onRemove}>
          <Trash />
        </button>
      </div>
    </>
  );
}

function SavedRow({ c }: { c: ConnectionState }) {
  const [replacing, setReplacing] = useState(false);
  return (
    <div className="source-card">
      <SourceHead
        type={c.type}
        connected={c.connected}
        name={<NameField value={c.name} type={c.type} onCommit={(n) => renameConnection(c.id, n)} />}
        onRemove={() => void removeConnection(c.id).then(() => toast(`${c.name} removed`, 'info'))}
      />
      {replacing || !c.connected ? (
        <KeyForm
          type={c.type}
          label={c.name}
          onKey={async (key, checked) => {
            await replaceKey(c.id, key);
            setReplacing(false);
            toast(checked ? `${c.name}: new key saved` : `${c.name}: key saved · couldn’t reach ${typeInfo(c.type).label} to check it`, checked ? 'ok' : 'info');
          }}
        />
      ) : (
        <div className="source-row">
          <span className="srow-desc" style={{ flex: 1 }}>Key saved. {typeInfo(c.type).what}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReplacing(true)}>Replace key</button>
        </div>
      )}
    </div>
  );
}

function DraftRow({ d, onName, onRemove, onSaved }: { d: Draft; onName: (name: string) => void; onRemove: () => void; onSaved: () => void }) {
  const info = typeInfo(d.type);
  return (
    <div className="source-card">
      <SourceHead type={d.type} connected={false} name={<NameField value={d.name} type={d.type} onChange={onName} />} onRemove={onRemove} />
      <span className="srow-desc">{info.what}</span>
      <ol className="source-steps">
        {info.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <KeyForm
        type={d.type}
        label={d.name}
        onKey={async (key, checked) => {
          await addConnection(d.type, d.name, key);
          onSaved();
          toast(checked ? `${d.name.trim() || info.label} connected` : `${d.name.trim() || info.label}: key saved · couldn’t reach ${info.label} to check it`, checked ? 'ok' : 'info');
        }}
      />
    </div>
  );
}

let draftSeq = 0;

/**
 * The person's wallpaper sources: one row per connection, each with its own name and key, and a
 * "+" that adds another (several of one provider fall over between their keys). `starter` opens
 * with a Pexels and a Pixabay row ready to fill in, when there are none yet.
 */
export function Sources({ starter = false }: { starter?: boolean }) {
  const connections = useConnections();
  const vault = useVaultName();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    starter && connections.length === 0
      ? (['pexels', 'pixabay'] as const).map((type) => ({ draft: `d${++draftSeq}`, type, name: typeInfo(type).label }))
      : [],
  );
  const [choosing, setChoosing] = useState(false);

  const add = (type: ConnectionType) => {
    const names = [...connections, ...drafts];
    setDrafts((ds) => [...ds, { draft: `d${++draftSeq}`, type, name: defaultName(type, names) }]);
    setChoosing(false);
  };
  const drop = (draft: string) => setDrafts((ds) => ds.filter((d) => d.draft !== draft));

  return (
    <div className="sources">
      {connections.map((c) => <SavedRow key={c.id} c={c} />)}
      {drafts.map((d) => (
        <DraftRow
          key={d.draft}
          d={d}
          onName={(name) => setDrafts((ds) => ds.map((x) => (x.draft === d.draft ? { ...x, name } : x)))}
          onRemove={() => drop(d.draft)}
          onSaved={() => drop(d.draft)}
        />
      ))}
      {connections.length === 0 && drafts.length === 0 && (
        <div className="empty" style={{ padding: '18px 0' }}>No wallpaper sources yet. Add one to browse its videos.</div>
      )}

      {choosing ? (
        <div className="source-add" role="group" aria-label="Choose a provider">
          <span className="srow-desc">Add a source from</span>
          {CONNECTION_TYPES.map((t) => (
            <button key={t.type} type="button" className="btn btn-secondary btn-sm" onClick={() => add(t.type)}>{t.label}</button>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChoosing(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary source-add-btn" onClick={() => setChoosing(true)}>
          <Plus />Add provider
        </button>
      )}

      <p className="source-note">
        <ShieldCheck weight="fill" />
        Keys are free and yours: they stay in {vault}, are sent only to their own provider, and every request counts against your own
        free allowance. Several keys for one provider take turns when one runs out. Drift doesn’t ship with any keys and never sees yours.
      </p>
    </div>
  );
}
