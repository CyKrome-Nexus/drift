// Liquid glass: blur + a light diagonal sheen + a lit top edge.
//
// iOS blurs whatever is behind the view. Android's BlurView can only blur a BlurTargetView, and
// must sit outside it: screens wrap what glass floats over in <BlurTarget> and put the glass
// beside it under <GlassTarget>. Glass with no target (or inside the target itself) gets the same
// sheen over a darker translucent fill instead.

import { createContext, useContext, useRef, type RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glass } from '@drift/tokens';

type Target = RefObject<View | null>;

const TargetContext = createContext<Target | null>(null);

/** A ref for a screen's blur target. */
export function useBlurTargetRef(): Target {
  return useRef<View | null>(null);
}

/** Glass inside this blurs `target`. */
export function GlassTarget({ target, children }: { target: Target | null; children: React.ReactNode }) {
  return <TargetContext.Provider value={target}>{children}</TargetContext.Provider>;
}

/** What glass floats over. Glass inside it cannot blur it, so it falls back to the tinted fill. */
export function BlurTarget({ target, style, children }: { target: Target; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <BlurTargetView ref={target} style={style} collapsable={false}>
      <TargetContext.Provider value={null}>{children}</TargetContext.Provider>
    </BlurTargetView>
  );
}

export function Glass({ style, radius = 16, accent = false, children }: { style?: StyleProp<ViewStyle>; radius?: number; accent?: boolean; children?: React.ReactNode }) {
  const target = useContext(TargetContext);
  const sheen: [string, string] = accent ? ['rgba(145,132,217,0.72)', 'rgba(145,132,217,0.3)'] : [glass.from, glass.to];
  const blur = Platform.OS === 'ios' || target !== null;
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {blur ? (
        <BlurView
          intensity={40}
          tint="dark"
          blurTarget={target ?? undefined}
          blurMethod="dimezisBlurViewSdk31Plus"
          style={[StyleSheet.absoluteFill, Platform.OS === 'android' && { backgroundColor: 'rgba(22,24,38,0.35)' }]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,24,38,0.72)' }]} />
      )}
      <LinearGradient colors={sheen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: glass.edge, borderTopColor: glass.highlight }]}
      />
      {/* Glass on glass: the outer blur is already behind it, so Android does not blur twice. */}
      <TargetContext.Provider value={null}>{children}</TargetContext.Provider>
    </View>
  );
}
