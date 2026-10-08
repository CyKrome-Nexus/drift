import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { color } from '@drift/tokens';
import { Text } from './Text';

export function ScreenHeader({ title, back = 'Settings' }: { title: string; back?: string }) {
  return (
    <View style={{ gap: 10, marginBottom: 4 }}>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}>
        <CaretLeft size={18} color={color.accent} />
        <Text size={15} tone={color.accent}>{back}</Text>
      </Pressable>
      <Text weight="medium" size={30} style={{ marginHorizontal: 4 }}>{title}</Text>
    </View>
  );
}
