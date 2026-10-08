// A wallpaper's art in SVG, drawn from the same layer data the desktop paints with CSS.
//
// The desktop drifts an oversized background; here the oversized SVG itself drifts on the native
// driver, which keeps the JS thread idle while a loop plays.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { art, type Wallpaper } from '@drift/core';
import { DRIFT_MS, OVERSCAN_X, OVERSCAN_Y } from '../lib/motion';

function ArtSvg({ w, width, height }: { w: Wallpaper; width: number; height: number }) {
  const { layers, base } = art(w, 'portrait');
  const rad = (base.angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  const id = `w${w.id}`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`${id}b`} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
          <Stop offset="0" stopColor={base.from} />
          <Stop offset="1" stopColor={base.to} />
        </LinearGradient>
        {layers.map((l, i) => {
          // CSS sizes these to the farthest corner; the fade stop is a percentage of that.
          const cx = (l.x / 100) * width;
          const cy = (l.y / 100) * height;
          const fx = Math.max(cx, width - cx);
          const fy = Math.max(cy, height - cy);
          const r = l.shape === 'circle' ? Math.hypot(fx, fy) : 0;
          return (
            <RadialGradient
              key={i}
              id={`${id}l${i}`}
              gradientUnits="userSpaceOnUse"
              cx={cx}
              cy={cy}
              rx={l.shape === 'circle' ? r : fx * Math.SQRT2}
              ry={l.shape === 'circle' ? r : fy * Math.SQRT2}
            >
              <Stop offset="0" stopColor={l.color} stopOpacity={1} />
              <Stop offset={l.fade / 100} stopColor={l.color} stopOpacity={0} />
            </RadialGradient>
          );
        })}
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id}b)`} />
      {[2, 1, 0].map((i) => <Rect key={i} width={width} height={height} fill={`url(#${id}l${i})`} />)}
    </Svg>
  );
}

export function Art({ w, still = false, paused = false, radius = 0 }: { w: Wallpaper; still?: boolean; paused?: boolean; radius?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const t = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [w.id, still, fade]);

  useEffect(() => {
    if (still || paused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: DRIFT_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: DRIFT_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, paused, t]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const artW = still ? size.width : size.width * OVERSCAN_X;
  const artH = still ? size.height : size.height * OVERSCAN_Y;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, size.width - artW] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, size.height - artH] });

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: radius }]} onLayout={onLayout} pointerEvents="none">
      {size.width > 0 && (
        <Animated.View style={{ opacity: fade, transform: still ? [] : [{ translateX }, { translateY }] }}>
          <ArtSvg w={w} width={artW} height={artH} />
        </Animated.View>
      )}
    </View>
  );
}
