import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowClockwise, CheckCircle, CrownSimple, Lock, SignOut } from 'phosphor-react-native';
import { displayName, initials, planLine } from '@drift/account';
import { LINKS, PRO_FEATURES } from '@drift/core';
import { color, font } from '@drift/tokens';
import { Button, Group, Row } from '../components/controls';
import { FEATURE_ICONS } from '../components/featureIcons';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { messageOf, proProductConfigured, refreshPlan, requestCode, signInWithCode, signOut } from '../lib/account';
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

function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!sent) {
        await requestCode(email.trim());
        setSent(true);
      } else {
        await signInWithCode(email.trim(), code.trim());
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.mark}><View style={styles.markDot} /></View>
      <Text weight="medium" size={19}>Sign in with your CyKrome Account</Text>
      <Text size={13} tone={color.neutral[400]}>
        One account across every CyKrome Nexus app. We’ll email you a code — no password needed on your phone.
      </Text>
      <Field label="Email" value={email} onChangeText={setEmail} editable={!sent} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      {sent && (
        <Field label="Code from your email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus style={{ fontFamily: font.medium, letterSpacing: 4 }} />
      )}
      {error ? <Text size={13} tone="#f2a7a7" accessibilityRole="alert">{error}</Text> : null}
      <Button
        variant="primary"
        label={sent ? 'Verify and sign in' : 'Email me a code'}
        icon={busy ? <ActivityIndicator size="small" color={color.accent} /> : undefined}
        disabled={busy || !emailOk || (sent && code.trim().length < 4)}
        onPress={() => void submit()}
      />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        {sent && <Pressable onPress={() => { setSent(false); setCode(''); }}><Text size={13} tone={color.accent}>Use a different email</Text></Pressable>}
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(LINKS.signUp)}><Text size={13} tone={color.accent}>Create a CyKrome Account</Text></Pressable>
      </View>
    </View>
  );
}

function SignedIn() {
  const { user, plan, planError } = useApp((s) => s.account);
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
      </View>

      <Group title="Subscription">
        <Row first label={isPro ? 'Drift Pro' : 'Drift Free'} icon={<CrownSimple size={19} weight={isPro ? 'fill' : 'regular'} color={color.accent} />} value={planLine(plan)} />
        {planError ? <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}><Text size={12} tone="#f2a7a7">{planError}</Text></View> : null}
        {PRO_FEATURES.map((f) => {
          const Icon = FEATURE_ICONS[f.id];
          return (
            <View key={f.id} style={styles.feature}>
              <Icon size={18} color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text size={14}>{f.title}{f.soon ? <Text size={11} tone={color.neutral[400]}>  · Soon</Text> : null}</Text>
                <Text size={12} tone={color.neutral[400]}>{f.detail}</Text>
              </View>
              {isPro ? <CheckCircle size={16} weight="fill" color="#7fd1a0" /> : <Lock size={15} color={color.neutral[500]} />}
            </View>
          );
        })}
      </Group>

      <View style={{ gap: 10 }}>
        {isPro ? (
          <Button label="Manage subscription" onPress={() => void WebBrowser.openBrowserAsync(LINKS.pro)} />
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
      {!proProductConfigured && (
        <Text size={12} tone={color.neutral[500]}>Build note: EXPO_PUBLIC_DRIFT_PRO_PRODUCT_ID is not set, so every account reads as Drift Free.</Text>
      )}
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
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.neutral[800] },
});
