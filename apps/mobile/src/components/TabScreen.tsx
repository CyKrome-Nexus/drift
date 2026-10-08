// A tab's content is what the floating glass tab bar blurs. Each tab registers its own blur
// target; the bar blurs the focused tab's.

import type { RefObject } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import { BlurTarget } from './Glass';

const targets: Record<string, RefObject<View | null>> = {};

export function tabBlurTarget(route: string): RefObject<View | null> {
  return (targets[route] ??= { current: null });
}

export function TabScreen({ route, style, children }: { route: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <BlurTarget target={tabBlurTarget(route)} style={[{ flex: 1 }, style]}>{children}</BlurTarget>;
}
