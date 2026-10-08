import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, GearSix, House, Stack as StackIcon, type IconProps } from 'phosphor-react-native';
import { color } from '@drift/tokens';
import { Glass } from '../../components/Glass';
import { Text } from '../../components/Text';

/** expo-router's own Tabs typing, so the app does not import @react-navigation directly. */
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, React.ComponentType<IconProps>> = {
  index: House,
  explore: Compass,
  library: StackIcon,
  settings: GearSix,
};

/** The floating glass bar from the design: 66pt tall, 28pt corners, inset 16pt from the edges. */
function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <Glass radius={28} style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 8, height: 66 }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const Icon = ICONS[route.name] ?? House;
          const label = descriptors[route.key].options.title ?? route.name;
          const tint = focused ? color.accent : color.neutral[400];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
            >
              <Icon size={22} color={tint} weight={focused ? 'fill' : 'regular'} />
              <Text size={10} tone={tint}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
