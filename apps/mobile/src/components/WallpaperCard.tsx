import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CrownSimple, Heart } from 'phosphor-react-native';
import type { Wallpaper } from '@drift/core';
import { color } from '@drift/tokens';
import { useApp } from '../lib/store';
import { Art } from './Art';
import { Text } from './Text';

export function WallpaperCard({ w, width, height, rank }: { w: Wallpaper; width: number; height: number; rank?: number }) {
  const fav = useApp((s) => s.favs.includes(w.id));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${w.name} by ${w.publisher}`}
      onPress={() => router.push(`/wallpaper/${encodeURIComponent(w.id)}`)}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'flex-end' }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      {rank !== undefined && (
        // RN has no text stroke; a ghosted numeral carries the same idea.
        <Text weight="semibold" size={88} tone={color.neutral[600]} style={styles.rank}>{rank}</Text>
      )}
      <View style={{ width, gap: 6 }}>
        <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: color.surface }}>
          <Art w={w} still radius={12} />
          <View style={[styles.badge, { left: 7 }]}>
            <View style={styles.dot} />
            <Text size={9} style={{ letterSpacing: 0.7 }}>LIVE</Text>
          </View>
          {w.tier === 'pro' && (
            <View style={[styles.badge, { right: 7 }]}>
              <CrownSimple size={9} weight="fill" color={color.accentRamp[200]} />
              <Text size={9} tone={color.accentRamp[200]}>PRO</Text>
            </View>
          )}
          {fav && <Heart size={13} weight="fill" color={color.accentRamp[300]} style={{ position: 'absolute', bottom: 8, right: 8 }} />}
        </View>
        <Text size={12} weight="medium" numberOfLines={1}>{w.name}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // lineHeight must cover the glyph or iOS clips it away; the negative margin tucks it under the card.
  rank: { lineHeight: 96, marginBottom: -14, marginRight: -6, letterSpacing: -2, includeFontPadding: false },
  badge: {
    position: 'absolute', top: 7, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(22,24,38,0.6)',
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.accentRamp[400] },
});
