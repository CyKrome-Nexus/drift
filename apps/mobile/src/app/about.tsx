// Settings › About, after Aperture's: identity, quick actions, updates, the build ledger and the
// CyKrome Nexus publisher block. Updates come from the stores on a phone, so that section says
// so instead of offering a check.

import { useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Check, Copy, PaperPlaneTilt, Storefront } from 'phosphor-react-native';
import { displayName } from '@drift/account';
import { LINKS, PRODUCT, PUBLISHER, legalLine } from '@drift/core';
import { color } from '@drift/tokens';
import { ScreenHeader } from '../components/ScreenHeader';
import { Eyebrow, Text } from '../components/Text';
import { useApp } from '../lib/store';

// Under Expo Go the native version is Expo Go's own, so read the app config there instead.
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';
const VERSION = (IN_EXPO_GO ? null : Application.nativeApplicationVersion) ?? Constants.expoConfig?.version ?? '0.1.0';
const BUILD = IN_EXPO_GO ? 'Expo Go' : (Application.nativeBuildVersion ?? 'dev');
const PLATFORM = `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`;
const STORE = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

function Ledger({ rows }: { rows: Array<[string, React.ReactNode, string?]> }) {
  return (
    <View style={styles.box}>
      {rows.map(([k, v, note], i) => (
        <View key={k} style={[styles.ledgerRow, i > 0 && styles.sep]}>
          <Text size={13} tone={color.neutral[400]} style={{ width: 118 }}>{k}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            {typeof v === 'string' ? <Text size={13}>{v}</Text> : v}
            {note ? <Text size={11.5} tone={color.neutral[500]}>{note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function Action({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      {icon}
      <Text size={12}>{label}</Text>
    </Pressable>
  );
}

export default function About() {
  const insets = useSafeAreaInsets();
  const account = useApp((s) => s.account);
  const settings = useApp((s) => s.settings);
  const [copied, setCopied] = useState(false);

  const accountLine =
    account.status === 'signedIn' && account.user
      ? `${displayName(account.user)} · ${account.plan.plan === 'pro' ? 'Drift Pro' : 'Drift Free'}`
      : 'Not signed in';

  const copyDiagnostics = async () => {
    await Clipboard.setStringAsync(
      [`Drift ${VERSION} (${BUILD})`, `Platform: ${PLATFORM}`, `Expo SDK ${Constants.expoConfig?.sdkVersion ?? '?'}`, `Plan: ${account.plan.plan}`, `Playback: ${settings.fps} fps · ${settings.quality}`].join('\n'),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const mailFounder = () => {
    const body = ['', '', '—', `Drift ${VERSION} · ${PLATFORM}`, ...(account.user ? [`CyKrome Account: ${account.user.email}`] : [])].join('\n');
    void Linking.openURL(`mailto:${PUBLISHER.founderEmail}?subject=${encodeURIComponent('Drift — a note')}&body=${encodeURIComponent(body)}`);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 24 }}>
      <ScreenHeader title="About" />

      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 64, height: 64, borderRadius: 15 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="medium" size={22}>{PRODUCT.name}</Text>
          <Text size={12} tone={color.neutral[400]}>Version {VERSION} ({BUILD}) · {PLATFORM}</Text>
        </View>
      </View>
      <Text size={13} tone={color.neutral[300]}>{PRODUCT.blurb}</Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Action label="Docs" icon={<BookOpen size={18} color={color.accent} />} onPress={() => void WebBrowser.openBrowserAsync(LINKS.docs)} />
        <Action label={copied ? 'Copied' : 'Diagnostics'} icon={copied ? <Check size={18} color="#7fd1a0" /> : <Copy size={18} color={color.accent} />} onPress={() => void copyDiagnostics()} />
        <Action label="Mail Founder" icon={<PaperPlaneTilt size={18} color={color.accent} />} onPress={mailFounder} />
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow style={{ paddingHorizontal: 4 }}>Updates</Eyebrow>
        <View style={[styles.box, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }]}>
          <Storefront size={20} color={color.accent} />
          <View style={{ flex: 1 }}>
            <Text size={14}>Updates come from {STORE}</Text>
            <Text size={12} tone={color.neutral[400]}>Installed {VERSION} · build {BUILD}</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow style={{ paddingHorizontal: 4 }}>Build</Eyebrow>
        <Ledger
          rows={[
            ['Version', `${VERSION} (${BUILD})`],
            ['Platform', PLATFORM],
            ['Wallpaper engine', 'Preview', Platform.OS === 'ios' ? 'iOS lets apps save Live Photos, not set wallpapers; export is not built yet' : 'The Android live wallpaper service is not built yet'],
            ['Shell', `Expo SDK ${Constants.expoConfig?.sdkVersion ?? '?'}`, 'React Native, new architecture'],
            ['Interface', 'React 19', 'Shares its catalog, plans and account client with Drift for desktop'],
            ['Theme', 'Nocturne · OKLCH', 'Dark, with the CyKrome Nexus blurple accent'],
            ['Account', 'CyKrome Account', accountLine],
            ['Storage', 'On device', 'Sign-in token in the system keychain; settings and lists in app storage'],
            ['Telemetry', <Text key="t" size={13} tone="#7fd1a0">None</Text>, 'No usage data leaves this phone'],
          ]}
        />
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={require('../../assets/cykrome-logo.png')} style={{ width: 36, height: 36, borderRadius: 8 }} />
          <Text weight="medium" size={18}>CyKrome Nexus</Text>
        </View>
        <Text size={13} tone={color.neutral[300]}>{PUBLISHER.prose}</Text>
        <Ledger
          rows={PUBLISHER.links.map((l) => [
            l.label,
            <Pressable key={l.href} onPress={() => void WebBrowser.openBrowserAsync(l.href)}>
              <Text size={13} tone={color.accent}>{'prefix' in l ? <Text size={13}>{l.prefix}</Text> : null}{l.text}</Text>
            </Pressable>,
          ])}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text size={11.5} tone={color.neutral[500]}>{legalLine()}</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(LINKS.privacy)}><Text size={12} tone={color.accent}>Privacy</Text></Pressable>
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(LINKS.terms)}><Text size={12} tone={color.accent}>Terms</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, backgroundColor: 'rgba(35,37,50,0.85)', borderWidth: 1, borderColor: color.neutral[800], overflow: 'hidden' },
  ledgerRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  sep: { borderTopWidth: 1, borderTopColor: color.neutral[800] },
  action: {
    flex: 1, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1, borderColor: color.divider,
  },
});
