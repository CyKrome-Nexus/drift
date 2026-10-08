import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, Info } from 'phosphor-react-native';
import { color } from '@drift/tokens';
import { useApp } from '../lib/store';
import { Text } from './Text';

export function Toast() {
  const t = useApp((s) => s.toast);
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (!t) return;
    y.setValue(-20);
    Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
  }, [t, y]);

  if (!t) return null;
  const Icon = t.tone === 'ok' ? CheckCircle : Info;
  return (
    <Animated.View style={[styles.toast, { top: insets.top + 56, transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite" pointerEvents="none">
      <Icon size={17} weight="fill" color={color.accent} />
      <Text size={13} style={{ flex: 1 }}>{t.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 20, right: 20, zIndex: 70, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.surface,
    borderWidth: 1, borderColor: color.neutral[700],
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
});
