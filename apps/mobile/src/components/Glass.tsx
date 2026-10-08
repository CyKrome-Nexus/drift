// Liquid glass: blur + a light diagonal sheen + a lit top edge.
//
// iOS blurs whatever is behind the view. Android's BlurView only blurs content wrapped in a
// BlurTargetView, which a floating tab bar over a scrolling list cannot use cheaply, so Android
// gets the same sheen over a darker translucent fill instead.

import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glass } from '@drift/tokens';

export function Glass({ style, radius = 16, accent = false, children }: { style?: StyleProp<ViewStyle>; radius?: number; accent?: boolean; children?: React.ReactNode }) {
  const sheen: [string, string] = accent ? ['rgba(145,132,217,0.72)', 'rgba(145,132,217,0.3)'] : [glass.from, glass.to];
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,24,38,0.72)' }]} />
      )}
      <LinearGradient colors={sheen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: glass.edge, borderTopColor: glass.highlight }]}
      />
      {children}
    </View>
  );
}
