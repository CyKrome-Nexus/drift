// Wallpaper sources: the person's own free Pexels and Pixabay keys. Opens by itself on first launch
// (`?welcome=1`) and from Settings. Keys stay in Secure Store and go only to their own provider;
// Drift ships with none (see @drift/wallpapers keys.ts).

import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowSquareOut, CheckCircle, Key, ShieldCheck, WarningCircle } from 'phosphor-react-native';
import { KEY_PROVIDERS, verifyKey, type KeyProviderInfo } from '@drift/wallpapers';
import { color, font } from '@drift/tokens';
import { Button } from '../components/controls';
import { ScreenHeader } from '../components/ScreenHeader';
import { Eyebrow, Text } from '../components/Text';
import { finishOnboarding, setKey, useKeys } from '../lib/catalog';
import { toast } from '../lib/store';

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
        toast(check === 'ok' ? `${p.label} connected` : `${p.label} key saved · couldn’t reach ${p.label} to check it`, check === 'ok' ? 'ok' : 'info');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text weight="medium" size={16}>{p.label}</Text>
          <Text size={13} tone={color.neutral[300]}>{p.what}</Text>
          <Text size={12} tone={color.neutral[500]}>{p.limits}</Text>
        </View>
        {connected ? (
          <View style={styles.status}><CheckCircle size={14} weight="fill" color={color.accent} /><Text size={12} tone={color.accent}>Connected</Text></View>
        ) : (
          <View style={styles.status}><Key size={14} color={color.neutral[400]} /><Text size={12} tone={color.neutral[400]}>No key</Text></View>
        )}
      </View>

      {connected ? (
        <Button label="Remove key" onPress={() => void setKey(p.name, null).then(() => toast(`${p.label} key removed`, 'info'))} />
      ) : (
        <>
          <View style={{ gap: 4 }}>
            {p.steps.map((s, i) => <Text key={s} size={13} tone={color.neutral[300]}>{i + 1}. {s}</Text>)}
          </View>
          <Button label="Get a free key" icon={<ArrowSquareOut size={16} color={color.text} />} onPress={() => void Linking.openURL(p.keyUrl)} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={`Paste your ${p.label} API key`}
              placeholderTextColor={color.neutral[500]}
              selectionColor={color.accent}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => value.trim() && !busy && void save()}
              accessibilityLabel={`${p.label} API key`}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!value.trim() || busy}
              onPress={() => void save()}
              style={[styles.save, (!value.trim() || busy) && { opacity: 0.5 }]}
            >
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
      )}
    </View>
  );
}

export default function Sources() {
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const first = welcome === '1';
  const insets = useSafeAreaInsets();
  const keys = useKeys();
  const any = Object.values(keys).some(Boolean);
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
            Drift plays thousands of free videos from Pexels and Pixabay as live wallpapers. To use them, connect your own free API key
            for each: it takes a minute, costs nothing, and keeps your browsing yours.
          </Text>
        </View>
      ) : (
        <ScreenHeader title="Wallpaper sources" />
      )}

      {KEY_PROVIDERS.map((p) => <ProviderCard key={p.name} p={p} connected={keys[p.name]} />)}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <ShieldCheck size={16} weight="fill" color={color.accent} style={{ marginTop: 2 }} />
        <Text size={12} tone={color.neutral[400]} style={{ flex: 1, lineHeight: 18 }}>
          Keys are free and yours: they stay in this phone’s secure storage, are sent only to their own provider, and every request
          counts against your own free allowance. Drift doesn’t ship with any keys and never sees yours.
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
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: color.divider,
    color: color.text, fontFamily: font.regular, fontSize: 15, backgroundColor: color.bg,
  },
  save: { height: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' },
});
