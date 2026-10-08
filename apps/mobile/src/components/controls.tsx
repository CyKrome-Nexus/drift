import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { CaretRight, CrownSimple } from 'phosphor-react-native';
import { color, radius } from '@drift/tokens';
import { Eyebrow, Text } from './Text';

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: on ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [on, x]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => onChange(!on)}
      style={[styles.track, on ? styles.trackOn : null]}
    >
      <Animated.View
        style={[
          styles.knob,
          {
            left: x.interpolate({ inputRange: [0, 1], outputRange: [4, 24] }),
            backgroundColor: on ? color.accent : color.neutral[500],
          },
        ]}
      />
    </Pressable>
  );
}

export function Group({ title, children, style }: { title?: string; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {title && <Eyebrow style={{ paddingHorizontal: 4 }}>{title}</Eyebrow>}
      <View style={styles.box}>{children}</View>
    </View>
  );
}

export function Row({
  icon,
  label,
  first,
  value,
  pro,
  onPress,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  first?: boolean;
  value?: string;
  pro?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const body = (
    <View style={[styles.row, !first && styles.rowSep]}>
      {icon}
      <Text size={15} style={{ flex: 1 }}>{label}</Text>
      {pro && <ProPill />}
      {value !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text size={14} tone={color.neutral[400]}>{value}</Text>
          {onPress && <CaretRight size={14} color={color.neutral[400]} />}
        </View>
      )}
      {children}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => (pressed ? { backgroundColor: 'rgba(233,233,237,0.05)' } : null)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function ProPill() {
  return (
    <View style={styles.pill}>
      <CrownSimple size={9} weight="fill" color={color.accentRamp[200]} />
      <Text size={9.5} weight="medium" tone={color.accentRamp[200]} style={{ letterSpacing: 0.6 }}>PRO</Text>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'secondary',
  disabled,
  style,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' ? styles.btnPrimary : styles.btnSecondary,
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {icon}
      <Text weight="medium" size={14} tone={variant === 'primary' ? color.accent : color.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48, height: 28, borderRadius: 14, backgroundColor: color.neutral[800],
    borderWidth: 1, borderColor: color.neutral[700],
  },
  trackOn: { backgroundColor: color.accentRamp[800], borderColor: color.accent },
  knob: { position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 10 },
  box: {
    borderRadius: radius.lg, backgroundColor: 'rgba(35,37,50,0.85)',
    borderWidth: 1, borderColor: color.neutral[800], overflow: 'hidden',
  },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14 },
  rowSep: { borderTopWidth: 1, borderTopColor: color.neutral[800] },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, backgroundColor: color.accentRamp[800],
  },
  btn: { height: 44, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnPrimary: { borderColor: color.accent },
  btnSecondary: { borderColor: color.divider },
});
