import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CheckCircle, CrownSimple } from 'phosphor-react-native';
import { LINKS, PRO_FEATURES } from '@drift/core';
import { alpha, color } from '@drift/tokens';
import { Button } from '../components/controls';
import { FEATURE_ICONS } from '../components/featureIcons';
import { Text } from '../components/Text';
import { messageOf, refreshPlan, session } from '../lib/account';
import { setState, toast, useApp } from '../lib/store';

/**
 * On a phone Drift sells nothing in the app (the CyKrome rule, @cykrome/sdk purchaseSurface): it
 * shows View on website and opens the Drift Pro page signed in. Desktop Drift and the CyKrome
 * Launcher list the plans instead. The plan refreshes when Drift comes back to the front.
 */
function ViewOnWebsite() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      label="View on website"
      icon={busy ? <ActivityIndicator size="small" color={color.accent} /> : <CrownSimple size={16} weight="fill" color={color.accent} />}
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await WebBrowser.openBrowserAsync(await session.upgradeUrl(LINKS.pro));
          await refreshPlan();
        } catch (err) {
          toast(messageOf(err), 'info');
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export default function Upgrade() {
  const feature = useApp((s) => s.upgradeFeature);
  const signedIn = useApp((s) => s.account.status === 'signedIn');
  const isPro = useApp((s) => s.account.plan.plan === 'pro');
  const reason = PRO_FEATURES.find((f) => f.id === feature);

  useEffect(() => () => setState({ upgradeFeature: null }), []);

  // Returning from the browser after buying is when the plan most likely changed.
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refreshPlan());
    return () => sub.remove();
  }, [signedIn]);

  useEffect(() => {
    if (isPro && router.canGoBack()) router.back();
  }, [isPro]);

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <LinearGradient colors={[alpha(color.accent, 0.35), alpha(color.accent, 0)]} start={{ x: 0.15, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 260 }} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 28, gap: 18 }}>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, backgroundColor: color.accentRamp[800] }}>
          <CrownSimple size={12} weight="fill" color={color.accentRamp[100]} />
          <Text size={11} tone={color.accentRamp[100]}>Drift Pro</Text>
        </View>
        <Text weight="medium" size={26}>{reason ? `${reason.title} is part of Drift Pro` : 'Get more from Drift'}</Text>
        <Text size={14} tone={color.neutral[300]}>Pro is tied to your CyKrome Account, so it unlocks on every device you sign in to.</Text>
        <View style={{ gap: 14, marginTop: 4 }}>
          {PRO_FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f.id];
            return (
              <View key={f.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Icon size={20} color={color.accent} />
                <View style={{ flex: 1 }}>
                  <Text size={15} tone={f.id === feature ? color.accentRamp[200] : color.text}>
                    {f.title}
                  </Text>
                  <Text size={12.5} tone={color.neutral[400]}>{f.detail}</Text>
                </View>
                {f.id === feature && <CheckCircle size={17} weight="fill" color={color.accent} />}
              </View>
            );
          })}
        </View>
        <View style={{ gap: 10, marginTop: 8 }}>
          {signedIn ? (
            <ViewOnWebsite />
          ) : (
            <Button variant="primary" label="Sign in to upgrade" onPress={() => router.replace('/account')} />
          )}
          <Button label="Not now" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}
