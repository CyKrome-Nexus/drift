import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowClockwise, ArrowsClockwise, CheckCircle, CloudSlash, CrownSimple, Lock, SignOut } from 'phosphor-react-native';
import { displayName, initials, planLine, type SyncStatus } from '@drift/account';
import { LINKS, PRO_FEATURES } from '@drift/core';
import { color, font } from '@drift/tokens';
import { Button, Group, Row } from '../components/controls';
import { FEATURE_ICONS } from '../components/featureIcons';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { messageOf, refreshPlan, requestCode, session, signInWithCode, signInWithPassword, signOut, signUp, syncNow } from '../lib/account';
import { useApp } from '../lib/store';

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text size={12} tone={color.neutral[400]}>{label}</Text>
      <TextInput placeholderTextColor={color.neutral[500]} selectionColor={color.accent} {...rest} style={[styles.input, style]} />
    </View>
  );
}

type Mode = 'code' | 'password' | 'signup';

const MODE_LABEL: Record<Mode, string> = { code: 'Email code', password: 'Password', signup: 'Create account' };

function SignIn() {
  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', username: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const profileOk = !!(profile.firstName.trim() && profile.lastName.trim() && /^[A-Za-z0-9_.-]{3,30}$/.test(profile.username.trim()));

  const switchMode = (m: Mode) => {
    setMode(m);
    setSent(false);
    setError('');
    setNotice('');
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        await signUp({
          email: email.trim(),
          username: profile.username.trim(),
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          password: password || undefined,
        });
        // CDS emails a code to verify the address; entering it also signs in.
        setMode('code');
        setSent(true);
        setPassword('');
        setNotice('Account created. Enter the code we emailed you to verify it and sign in.');
      } else if (mode === 'password') {
        await signInWithPassword(email, password);
      } else if (!sent) {
        await requestCode(email);
        setSent(true);
      } else {
        await signInWithCode(email, code);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const disabled =
    busy || !emailOk ||
    (mode === 'password' && !password) ||
    (mode === 'signup' && !profileOk) ||
    (mode === 'code' && sent && code.trim().length < 4);

  return (
    <View style={styles.card}>
      <View style={styles.mark}><View style={styles.markDot} /></View>
      <Text weight="medium" size={19}>{mode === 'signup' ? 'Create your CyKrome Account' : 'Sign in with your CyKrome Account'}</Text>
      <Text size={13} tone={color.neutral[400]}>
        One account across every CyKrome Nexus app, and the account Drift Pro belongs to.
      </Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['code', 'password', 'signup'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => switchMode(m)} style={[styles.tab, mode === m && styles.tabOn]}>
            <Text size={13} tone={mode === m ? color.text : color.neutral[400]}>{MODE_LABEL[m]}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'signup' && (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="First name" value={profile.firstName} onChangeText={(v) => setProfile({ ...profile, firstName: v })} autoComplete="given-name" textContentType="givenName" /></View>
            <View style={{ flex: 1 }}><Field label="Last name" value={profile.lastName} onChangeText={(v) => setProfile({ ...profile, lastName: v })} autoComplete="family-name" textContentType="familyName" /></View>
          </View>
          <Field label="Username" value={profile.username} onChangeText={(v) => setProfile({ ...profile, username: v })} autoCapitalize="none" autoComplete="username-new" textContentType="username" />
        </>
      )}
      <Field label="Email" value={email} onChangeText={setEmail} editable={!sent} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      {(mode === 'password' || mode === 'signup') && (
        <Field
          label={mode === 'signup' ? 'Password (optional)' : 'Password'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
        />
      )}
      {mode === 'signup' && <Text size={12} tone={color.neutral[500]}>Leave the password empty to always sign in with an emailed code.</Text>}
      {mode === 'code' && sent && (
        <Field label="Code from your email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus style={{ fontFamily: font.medium, letterSpacing: 4 }} />
      )}
      {notice && !error ? <Text size={13} tone={color.neutral[300]} accessibilityRole="summary">{notice}</Text> : null}
      {error ? <Text size={13} tone="#f2a7a7" accessibilityRole="alert">{error}</Text> : null}
      <Button
        variant="primary"
        label={mode === 'signup' ? 'Create account' : mode === 'password' ? 'Sign in' : sent ? 'Verify and sign in' : 'Email me a code'}
        icon={busy ? <ActivityIndicator size="small" color={color.accent} /> : undefined}
        disabled={disabled}
        onPress={() => void submit()}
      />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        {sent && <Pressable onPress={() => { setSent(false); setCode(''); setNotice(''); }}><Text size={13} tone={color.accent}>Use a different email</Text></Pressable>}
        {mode === 'password' && <Pressable onPress={() => void WebBrowser.openBrowserAsync(LINKS.account)}><Text size={13} tone={color.accent}>Forgot password?</Text></Pressable>}
      </View>
    </View>
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
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={styles.avatar}><Text weight="semibold" size={15} tone={color.accentRamp[200]}>{initials(user)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text size={16}>{displayName(user)}</Text>
          <Text size={12} tone={color.neutral[400]}>{user.email}</Text>
        </View>
        {offline && (
          <View style={styles.offline} accessibilityLabel="Offline: using your saved account and plan">
            <CloudSlash size={13} color={color.neutral[300]} />
            <Text size={11} tone={color.neutral[300]}>Offline</Text>
          </View>
        )}
      </View>

      <Group title="Subscription">
        <Row first label={isPro ? 'Drift Pro' : 'Drift Free'} icon={<CrownSimple size={19} weight={isPro ? 'fill' : 'regular'} color={color.accent} />} value={planLine(plan)} />
        {planError ? <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}><Text size={12} tone="#f2a7a7">{planError}</Text></View> : null}
        <Row
          label="Sync favourites and lists"
          icon={<ArrowsClockwise size={19} color={color.accent} />}
          value={isPro ? syncLine(sync) : 'Drift Pro'}
          onPress={isPro && !offline && sync.state !== 'syncing' ? () => void syncNow() : undefined}
        />
        {PRO_FEATURES.map((f) => {
          const Icon = FEATURE_ICONS[f.id];
          return (
            <View key={f.id} style={styles.feature}>
              <Icon size={18} color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text size={14}>{f.title}</Text>
                <Text size={12} tone={color.neutral[400]}>{f.detail}</Text>
              </View>
              {isPro ? <CheckCircle size={16} weight="fill" color="#7fd1a0" /> : <Lock size={15} color={color.neutral[500]} />}
            </View>
          );
        })}
      </Group>

      <View style={{ gap: 10 }}>
        {isPro ? (
          <Button label="Manage subscription" onPress={async () => { await WebBrowser.openBrowserAsync(await session.upgradeUrl(LINKS.pro)); await refreshPlan(); }} />
        ) : (
          <Button variant="primary" label="Upgrade to Drift Pro" icon={<CrownSimple size={16} weight="fill" color={color.accent} />} onPress={() => router.push('/upgrade')} />
        )}
        <Button
          label={refreshing ? 'Checking…' : 'Refresh plan'}
          icon={<ArrowClockwise size={16} color={color.text} />}
          disabled={refreshing}
          onPress={async () => { setRefreshing(true); await refreshPlan(); setRefreshing(false); }}
        />
        <Button label="Manage CyKrome Account" onPress={() => void WebBrowser.openBrowserAsync(LINKS.account)} />
        <Button label="Sign out" icon={<SignOut size={16} color={color.text} />} onPress={() => void signOut()} />
      </View>
    </>
  );
}

export default function Account() {
  const insets = useSafeAreaInsets();
  const status = useApp((s) => s.account.status);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 20 }}>
        <ScreenHeader title="Account" />
        {status === 'restoring' ? (
          <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={color.accent} />
            <Text size={13} tone={color.neutral[400]}>Checking your CyKrome session…</Text>
          </View>
        ) : status === 'signedIn' ? (
          <SignedIn />
        ) : (
          <SignIn />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 14, backgroundColor: color.surface, borderWidth: 1, borderColor: color.neutral[800] },
  input: {
    height: 44, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: color.divider,
    backgroundColor: color.bg, color: color.text, fontFamily: font.regular, fontSize: 15,
  },
  mark: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  markDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.accentRamp[800], alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 9, backgroundColor: color.bg, borderWidth: 1, borderColor: color.neutral[800] },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 7 },
  tabOn: { backgroundColor: color.neutral[800] },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: color.neutral[800] },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.neutral[800] },
});
