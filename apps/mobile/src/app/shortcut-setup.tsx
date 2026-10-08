// iOS experiment: one-tap wallpapers through an Apple Shortcut. Apps cannot create shortcuts, so
// the user makes "Drift Wallpaper" once; after that Drift saves the photo and runs it.

import { Linking, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Flask } from 'phosphor-react-native';
import { alpha, color } from '@drift/tokens';
import { Button } from '../components/controls';
import { Text } from '../components/Text';
import { setState, toast, useApp } from '../lib/store';
import { SHORTCUT_NAME } from '../lib/wallpaper';

/** Apple's documented URL for a new, empty shortcut. */
const NEW_SHORTCUT_URL = 'shortcuts://create-shortcut';

const STEPS = [
  'In Shortcuts, start a new shortcut (the button below opens one).',
  'Add “Get Latest Photos”. Set it to 1 photo and turn off Include Screenshots.',
  'Add “Set Wallpaper Photo” (“Set Wallpaper” on older iOS). Tap › on it and turn off Show Preview.',
  'Add “Open App” and choose Drift, so you land back here.',
  `Name the shortcut exactly “${SHORTCUT_NAME}” and tap Done.`,
];

export default function ShortcutSetup() {
  const on = useApp((s) => s.iosShortcut);

  const turnOn = () => {
    setState({ iosShortcut: true });
    toast('Set as wallpaper now runs your shortcut');
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <LinearGradient colors={[alpha(color.accent, 0.35), alpha(color.accent, 0)]} start={{ x: 0.15, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 260 }} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 28, gap: 18 }}>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, backgroundColor: color.accentRamp[800] }}>
          <Flask size={12} weight="fill" color={color.accentRamp[100]} />
          <Text size={11} tone={color.accentRamp[100]}>Experimental</Text>
        </View>
        <Text weight="medium" size={26}>One-tap wallpapers with Shortcuts</Text>
        <Text size={14} tone={color.neutral[300]}>
          iPhone only lets Apple’s own apps set the wallpaper. A shortcut you make once can do it for Drift: tap Set as wallpaper, and Drift saves the wallpaper and runs the shortcut, which sets it and brings you back.
        </Text>

        <View style={{ gap: 14 }}>
          {STEPS.map((step, i) => (
            <View key={step} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.accentRamp[800], alignItems: 'center', justifyContent: 'center' }}>
                <Text size={12} weight="semibold" tone={color.accentRamp[100]}>{i + 1}</Text>
              </View>
              <Text size={14.5} style={{ flex: 1, lineHeight: 21 }}>{step}</Text>
            </View>
          ))}
        </View>

        <Text size={12.5} tone={color.neutral[400]}>
          The first few runs, iPhone may ask to allow the shortcut — choose Always Allow. Shortcuts may set a still photo rather than a Live Photo.
        </Text>

        <View style={{ gap: 10, marginTop: 4 }}>
          <Button label="Open Shortcuts" onPress={() => void Linking.openURL(NEW_SHORTCUT_URL).catch(() => toast('Couldn’t open Shortcuts', 'info'))} />
          {on ? (
            <Button variant="primary" label="Done" onPress={() => router.back()} />
          ) : (
            <Button variant="primary" label="I’ve added it — turn on" onPress={turnOn} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
