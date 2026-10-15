// After the Live Photo is saved (iOS): how to make it the wallpaper. iOS lets no app set it, and
// has no public link into the wallpaper settings, so the steps are spelled out.

import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import { alpha, color } from '@drift/tokens';
import { Art } from '../components/Art';
import { Button } from '../components/controls';
import { Text } from '../components/Text';
import { useApp } from '../lib/store';

export default function LivePhotoGuide() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const target = useApp((s) => s.settings.applyTarget);
  const w = useApp((s) => (raw ? s.known[raw] : undefined)) ?? null;
  const name = w ? `“${w.name}”` : 'Your wallpaper';

  const steps = [
    'Open the Settings app and tap Wallpaper, then Add New Wallpaper.',
    `Tap Photos and pick ${name} — it is the newest photo in your library.`,
    'Leave Live Photo on (the circle button at the bottom), then tap Add.',
    target === 'Lock'
      ? 'Tap Customize Home Screen to keep a different home screen, or Set as Wallpaper Pair.'
      : 'Tap Set as Wallpaper Pair — iPhone sets the lock and home screen together.',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <LinearGradient colors={[alpha(color.accent, 0.35), alpha(color.accent, 0)]} start={{ x: 0.15, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 260 }} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 28, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={20} weight="fill" color={color.accent} />
          <Text size={13} tone={color.accentRamp[200]}>Saved to Photos</Text>
        </View>
        <Text weight="medium" size={26}>{name} is ready as a Live Photo</Text>
        <Text size={14} tone={color.neutral[300]}>
          iPhone doesn’t let apps change the wallpaper, so the last step is yours. The motion plays on the lock screen when you wake the phone.
        </Text>

        {w && (
          <View style={{ alignSelf: 'center', width: 132, height: 236, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: color.neutral[800] }}>
            <Art w={w} radius={18} />
          </View>
        )}

        <View style={{ gap: 14 }}>
          {steps.map((step, i) => (
            <View key={step} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.accentRamp[800], alignItems: 'center', justifyContent: 'center' }}>
                <Text size={12} weight="semibold" tone={color.accentRamp[100]}>{i + 1}</Text>
              </View>
              <Text size={14.5} style={{ flex: 1, lineHeight: 21 }}>{step}</Text>
            </View>
          ))}
        </View>

        <Button variant="primary" label="Done" onPress={() => router.back()} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
