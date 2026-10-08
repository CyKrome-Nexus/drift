import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BatteryLow,
  Bell,
  CaretRight,
  CrownSimple,
  GameController,
  Gauge,
  HardDrives,
  Info,
  Sparkle,
  SpeakerSlash,
  UserCircle,
  WifiHigh,
} from 'phosphor-react-native';
import { displayName, initials, planLine } from '@drift/account';
import { isProOption, type MobileSettings } from '@drift/core';
import { color } from '@drift/tokens';
import { Group, Row, Toggle } from '../../components/controls';
import { TabScreen } from '../../components/TabScreen';
import { Text } from '../../components/Text';
import { requirePro } from '../../lib/account';
import { checkFollowedCreators, enableNotifications } from '../../lib/notifications';
import { toast, updateSettings, useApp } from '../../lib/store';

type BoolKey = { [K in keyof MobileSettings]: MobileSettings[K] extends boolean ? K : never }[keyof MobileSettings];

const ic = (Icon: React.ComponentType<{ size: number; color: string }>) => <Icon size={19} color={color.accent} />;

function SettingToggle({ k, label, icon, first, onChange }: { k: BoolKey; label: string; icon: React.ReactNode; first?: boolean; onChange?: (v: boolean) => void }) {
  const on = useApp((s) => s.settings[k]);
  return (
    <Row icon={icon} label={label} first={first}>
      <Toggle on={on} label={label} onChange={onChange ?? ((v) => updateSettings({ [k]: v }))} />
    </Row>
  );
}

/** Only on once the system allows Drift to notify. */
async function setNotifyFollowed(on: boolean) {
  if (on && !(await enableNotifications().catch(() => false))) {
    toast('Allow notifications for Drift in your phone’s Settings', 'info');
    return;
  }
  updateSettings({ notifyFollowed: on });
  if (on) void checkFollowedCreators();
}

/** Tapping steps to the next option; Pro-only options open the upgrade sheet on free plans. */
function SettingCycle<K extends 'fps' | 'quality'>({ k, label, icon, options, format }: { k: K; label: string; icon: React.ReactNode; options: ReadonlyArray<MobileSettings[K]>; format: (v: MobileSettings[K]) => string }) {
  const value = useApp((s) => s.settings[k]);
  const isPro = useApp((s) => s.account.plan.plan === 'pro');
  const next = options[(options.indexOf(value) + 1) % options.length];
  return (
    <Row
      icon={icon}
      label={label}
      value={format(value)}
      pro={!isPro && options.some((o) => isProOption(k, o))}
      onPress={() => {
        if (!isPro && isProOption(k, next) && !requirePro.feature('unlimitedFrameRate')) return;
        updateSettings({ [k]: next } as Partial<MobileSettings>);
      }}
    />
  );
}

function ProfileCard() {
  const { status, user, plan } = useApp((s) => s.account);
  const signedIn = status === 'signedIn' && user;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={({ pressed }) => [styles.profile, pressed && { opacity: 0.8 }]}>
      <View style={[styles.avatar, !signedIn && { backgroundColor: color.neutral[800] }]}>
        {signedIn ? <Text weight="semibold" tone={color.accentRamp[200]}>{initials(user)}</Text> : <UserCircle size={24} color={color.neutral[300]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text size={15}>{signedIn ? displayName(user) : 'Sign in with CyKrome'}</Text>
        <Text size={12} tone={color.neutral[400]}>
          {signedIn ? `${plan.plan === 'pro' ? 'Drift Pro' : 'Drift Free'} · ${planLine(plan)}` : status === 'restoring' ? 'Checking your session…' : 'Unlock Drift Pro with your CyKrome Account'}
        </Text>
      </View>
      <CaretRight size={16} color={color.neutral[500]} />
    </Pressable>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const plan = useApp((s) => s.account.plan.plan);
  return (
    <TabScreen route="settings" style={{ backgroundColor: color.bg }}>
      <LinearGradient colors={[color.surface, color.bg]} locations={[0, 0.4]} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 16, paddingBottom: 130, gap: 20 }}>
        <Text weight="medium" size={30} style={{ marginHorizontal: 4, marginTop: 6 }}>Settings</Text>
        <ProfileCard />

        <Group title="Playback">
          <SettingToggle first k="pauseLowPower" label="Pause in Low Power Mode" icon={ic(BatteryLow)} />
          <SettingToggle k="pauseGaming" label="Pause while gaming" icon={ic(GameController)} />
          <SettingToggle k="muteAudio" label="Mute wallpaper audio" icon={ic(SpeakerSlash)} />
          <SettingCycle k="fps" label="Frame rate" icon={ic(Gauge)} options={['30', '60', '120']} format={(v) => `${v} fps`} />
        </Group>

        <Group title="Downloads">
          <SettingToggle first k="wifiOnly" label="Wi-Fi only" icon={ic(WifiHigh)} />
          <SettingCycle k="quality" label="Quality" icon={ic(Sparkle)} options={['Standard', 'High']} format={(v) => v} />
          <Row icon={ic(HardDrives)} label="Storage" value="0 MB" />
        </Group>

        <Group title="Account">
          <SettingToggle first k="notifyFollowed" label="New from followed creators" icon={ic(Bell)} onChange={(v) => void setNotifyFollowed(v)} />
          <Row
            icon={ic(CrownSimple)}
            label="Subscription"
            value={plan === 'pro' ? 'Pro' : 'Free'}
            onPress={() => (plan === 'pro' ? router.push('/account') : router.push('/upgrade'))}
          />
        </Group>

        <Group>
          <Row first icon={ic(Info)} label="About Drift" value="" onPress={() => router.push('/about')} />
        </Group>
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.neutral[800],
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.accentRamp[800], alignItems: 'center', justifyContent: 'center' },
});
