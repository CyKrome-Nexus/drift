// Wallpaper sources: the person's own free provider keys, one row per connection, each with a
// name they choose; "Add provider" adds another (several of one provider take turns when a key
// runs out). Opens by itself on first launch (`?welcome=1`) and from Settings. Keys stay in Secure
// Store and go only to their own provider; Drift ships with none (see @drift/wallpapers keys.ts).

import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowSquareOut, CheckCircle, Key, Plus, ShieldCheck, Trash, WarningCircle } from 'phosphor-react-native';
import { CONNECTION_TYPES, defaultName, typeInfo, verifyKey, type ConnectionType } from '@drift/wallpapers';
import { color, font } from '@drift/tokens';
import { Button } from '../components/controls';
import { ScreenHeader } from '../components/ScreenHeader';
import { Eyebrow, Text } from '../components/Text';
import { addConnection, finishOnboarding, removeConnection, renameConnection, replaceKey, useConnections, type ConnectionState } from '../lib/catalog';
import { toast } from '../lib/store';

/** A row not saved yet: it becomes a connection when its key is saved. */
interface Draft {
  draft: string;
  type: ConnectionType;
  name: string;
}

let draftSeq = 0;

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
        await onKey(value, check === 'ok');
        setValue('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(false);
  };

  return (
    <>
      <Button label="Get a free key" icon={<ArrowSquareOut size={16} color={color.text} />} onPress={() => void Linking.openURL(info.keyUrl)} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={`Paste your ${info.label} API key`}
          placeholderTextColor={color.neutral[500]}
          selectionColor={color.accent}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => value.trim() && !busy && void submit()}
          accessibilityLabel={`API key for ${label}`}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" disabled={!value.trim() || busy} onPress={() => void submit()} style={[styles.save, (!value.trim() || busy) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color={color.accent} /> : <Text size={14} tone={color.accent}>Save</Text>}
        </Pressable>
      </View>
      {error && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <WarningCircle size={14} weight="fill" color={color.accentRamp[300]} />
          <Text size={12} tone={color.accentRamp[200]} style={{ flex: 1 }}>{error}</Text>
        </View>
      )}
    </>
  );
}

/** The name, editable in place. Saved connections rename when editing ends. */
function NameField({ value, type, onCommit, onChange }: { value: string; type: ConnectionType; onCommit?: (name: string) => void; onChange?: (name: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <TextInput
      value={text}
      maxLength={40}
      placeholder={typeInfo(type).label}
      placeholderTextColor={color.neutral[500]}
      selectionColor={color.accent}
      accessibilityLabel="Name"
      returnKeyType="done"
      onChangeText={(t) => {
        setText(t);
        onChange?.(t);
      }}
      onEndEditing={() => text.trim() !== value && onCommit?.(text)}
      style={styles.name}
    />
  );
}

function Head({ type, connected, name, onRemove }: { type: ConnectionType; connected: boolean; name: React.ReactNode; onRemove: () => void }) {
  const info = typeInfo(type);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {name}
        <Text size={12} tone={color.neutral[500]}>{info.label} · {info.limits}</Text>
      </View>
      {connected ? (
        <View style={styles.status}><CheckCircle size={14} weight="fill" color={color.accent} /><Text size={12} tone={color.accent}>Connected</Text></View>
      ) : (
        <View style={styles.status}><Key size={14} color={color.neutral[400]} /><Text size={12} tone={color.neutral[400]}>No key</Text></View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Remove this source" hitSlop={10} onPress={onRemove} style={{ padding: 2 }}>
        <Trash size={18} color={color.neutral[400]} />
      </Pressable>
    </View>
  );
}

function SavedRow({ c }: { c: ConnectionState }) {
  const [replacing, setReplacing] = useState(false);
  const info = typeInfo(c.type);
  return (
    <View style={styles.card}>
      <Head
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
            toast(checked ? `${c.name}: new key saved` : `${c.name}: key saved · couldn’t reach ${info.label} to check it`, checked ? 'ok' : 'info');
          }}
        />
      ) : (
        <>
          <Text size={13} tone={color.neutral[300]}>Key saved. {info.what}</Text>
          <Button label="Replace key" onPress={() => setReplacing(true)} />
        </>
      )}
    </View>
  );
}

function DraftRow({ d, onName, onRemove, onSaved }: { d: Draft; onName: (name: string) => void; onRemove: () => void; onSaved: () => void }) {
  const info = typeInfo(d.type);
  return (
    <View style={styles.card}>
      <Head type={d.type} connected={false} name={<NameField value={d.name} type={d.type} onChange={onName} />} onRemove={onRemove} />
      <Text size={13} tone={color.neutral[300]}>{info.what}</Text>
      <View style={{ gap: 4 }}>
        {info.steps.map((s, i) => <Text key={s} size={13} tone={color.neutral[300]}>{i + 1}. {s}</Text>)}
      </View>
      <KeyForm
        type={d.type}
        label={d.name}
        onKey={async (key, checked) => {
          await addConnection(d.type, d.name, key);
          onSaved();
          const name = d.name.trim() || info.label;
          toast(checked ? `${name} connected` : `${name}: key saved · couldn’t reach ${info.label} to check it`, checked ? 'ok' : 'info');
        }}
      />
    </View>
  );
}

export default function Sources() {
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const first = welcome === '1';
  const insets = useSafeAreaInsets();
  const connections = useConnections();
  const any = connections.some((c) => c.connected);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    first && connections.length === 0
      ? (['pexels', 'pixabay'] as const).map((type) => ({ draft: `d${++draftSeq}`, type, name: typeInfo(type).label }))
      : [],
  );
  const [choosing, setChoosing] = useState(false);

  const add = (type: ConnectionType) => {
    setDrafts((ds) => [...ds, { draft: `d${++draftSeq}`, type, name: defaultName(type, [...connections, ...ds]) }]);
    setChoosing(false);
  };
  const drop = (draft: string) => setDrafts((ds) => ds.filter((d) => d.draft !== draft));
  const done = () => {
    finishOnboarding();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      {first ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>Welcome to Drift</Eyebrow>
          <Text weight="medium" size={30} style={{ lineHeight: 34 }}>Bring your own wallpapers</Text>
          <Text size={14} tone={color.neutral[300]} style={{ lineHeight: 21 }}>
            Drift plays thousands of free videos from Pexels, Pixabay and Coverr as live wallpapers. To use them, connect your own free
            API keys: it takes a minute, costs nothing, and keeps your browsing yours. Name each source as you like, and add more with
            “Add provider”.
          </Text>
        </View>
      ) : (
        <ScreenHeader title="Wallpaper sources" />
      )}

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
        <Text size={14} tone={color.neutral[400]} style={{ textAlign: 'center', paddingVertical: 12 }}>
          No wallpaper sources yet. Add one to browse its videos.
        </Text>
      )}

      {choosing ? (
        <View style={{ gap: 8 }}>
          <Text size={13} tone={color.neutral[400]}>Add a source from</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CONNECTION_TYPES.map((t) => <Button key={t.type} label={t.label} onPress={() => add(t.type)} style={{ flex: 1 }} />)}
          </View>
          <Button label="Cancel" onPress={() => setChoosing(false)} />
        </View>
      ) : (
        <Button label="Add provider" icon={<Plus size={16} color={color.text} />} onPress={() => setChoosing(true)} />
      )}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <ShieldCheck size={16} weight="fill" color={color.accent} style={{ marginTop: 2 }} />
        <Text size={12} tone={color.neutral[400]} style={{ flex: 1, lineHeight: 18 }}>
          Keys are free and yours: they stay in this phone’s secure storage, are sent only to their own provider, and every request
          counts against your own free allowance. Several keys for one provider take turns when one runs out. Drift doesn’t ship with any
          keys and never sees yours.
        </Text>
      </View>

      {first && (
        <View style={{ gap: 10, marginTop: 6 }}>
          <Button variant="primary" label="Start browsing" disabled={!any} onPress={done} />
          <Button label="Skip for now" onPress={done} />
          <Text size={12} tone={color.neutral[500]} style={{ textAlign: 'center' }}>
            Skipping shows Drift’s own generated loops. Add keys any time in Settings › Wallpaper sources.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: color.divider, backgroundColor: color.surface },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 4 },
  name: { color: color.text, fontFamily: font.medium, fontSize: 16, paddingVertical: 2 },
  input: {
    flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: color.divider,
    color: color.text, fontFamily: font.regular, fontSize: 15, backgroundColor: color.bg,
  },
  save: { height: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' },
});
