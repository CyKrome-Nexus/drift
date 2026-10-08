import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeviceMobile, Heart, Info, MagnifyingGlass } from 'phosphor-react-native';
import { initials } from '@drift/account';
import { CATEGORIES, FEATURED, TRENDING, byCategory, catalog, wallpaper, type Category } from '@drift/core';
import { alpha, color } from '@drift/tokens';
import { Art } from '../../components/Art';
import { Button } from '../../components/controls';
import { Text } from '../../components/Text';
import { WallpaperCard } from '../../components/WallpaperCard';
import { toggleFav, useApp } from '../../lib/store';
import { applyWallpaper } from '../../lib/wallpaper';

const TICKS = 60;
const HERO_H = 540;

function Hero() {
  const [{ hero, tick }, setCarousel] = useState({ hero: 0, tick: 0 });
  const w = wallpaper(FEATURED[hero]);
  const fav = useApp((s) => s.favs.includes(w.id));

  useEffect(() => {
    const iv = setInterval(() => {
      setCarousel((c) => (c.tick + 1 < TICKS ? { ...c, tick: c.tick + 1 } : { hero: (c.hero + 1) % FEATURED.length, tick: 0 }));
    }, 100);
    return () => clearInterval(iv);
  }, []);

  return (
    <View style={{ height: HERO_H, overflow: 'hidden' }}>
      <Art key={w.id} w={w} />
      <LinearGradient
        colors={[color.bg, alpha(color.bg, 0.55), alpha(color.bg, 0)]}
        locations={[0.02, 0.38, 0.62]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={[alpha(color.bg, 0.6), alpha(color.bg, 0)]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }} />
      <View style={styles.heroCopy}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[styles.tag, { backgroundColor: color.accentRamp[800] }]}><Text size={11} tone={color.accentRamp[100]}>Featured</Text></View>
          <View style={[styles.tag, { backgroundColor: color.neutral[800], flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
            <View style={styles.liveDot} /><Text size={11} tone={color.neutral[100]}>Live</Text>
          </View>
        </View>
        <Text weight="medium" size={38} style={{ lineHeight: 40 }}>{w.name}</Text>
        <Text size={12} tone={color.neutral[400]}>
          <Text size={12}>{w.publisher}</Text> · {w.category} · {w.loop} loop
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button variant="primary" label="Apply" icon={<DeviceMobile size={17} color={color.accent} />} onPress={() => applyWallpaper(w)} style={{ flex: 1 }} />
          <Button label="Details" icon={<Info size={17} color={color.text} />} onPress={() => router.push(`/wallpaper/${w.id}`)} style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'} onPress={() => toggleFav(w.id)} style={styles.iconBtn}>
            <Heart size={18} color={color.accent} weight={fav ? 'fill' : 'regular'} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
          {FEATURED.map((id, i) => (
            <Pressable key={id} hitSlop={8} accessibilityLabel={`Show ${wallpaper(id).name}`} onPress={() => setCarousel({ hero: i, tick: 0 })}
              style={{ height: 3, width: i === hero ? 28 : 10, borderRadius: 2, backgroundColor: color.neutral[700], overflow: 'hidden' }}>
              <View style={{ height: '100%', width: i === hero ? `${(tick / (TICKS - 1)) * 100}%` : '0%', backgroundColor: color.accent }} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const [chip, setChip] = useState<'All' | Category>('All');
  const user = useApp((s) => s.account.user);
  const all = catalog();
  const cats = CATEGORIES.filter((c) => chip === 'All' || chip === c.category);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        <Hero />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 }}>
          {(['All', ...CATEGORIES.map((c) => c.category)] as const).map((c) => {
            const on = chip === c;
            return (
              <Pressable key={c} onPress={() => setChip(c)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={[styles.chip, on ? { backgroundColor: color.accentRamp[900], borderColor: color.accent } : null]}>
                <Text size={13} tone={on ? color.accentRamp[200] : color.neutral[300]}>{c}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ gap: 20, paddingTop: 16 }}>
          {chip === 'All' && (
            <View style={{ gap: 4 }}>
              <View style={styles.rowHead}><Text weight="medium" size={16}>Top 10 this week</Text></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
                {TRENDING.map((id, i) => <WallpaperCard key={id} w={all[id]} width={108} height={192} rank={i + 1} />)}
              </ScrollView>
            </View>
          )}
          {cats.map(({ title, category }) => (
            <View key={category} style={{ gap: 4 }}>
              <View style={styles.rowHead}>
                <Text weight="medium" size={16}>{title}</Text>
                <Pressable onPress={() => router.push('/explore')} style={{ marginLeft: 'auto' }}><Text size={12} tone={color.accent}>See all</Text></Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
                {byCategory(category).map((w) => <WallpaperCard key={w.id} w={w} width={124} height={220} />)}
              </ScrollView>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + 14 }]}>
        <View style={styles.mark}><View style={styles.markDot} /></View>
        <Text weight="medium" size={18} style={{ marginRight: 'auto' }}>Drift</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/explore')} style={styles.roundBtn}>
          <MagnifyingGlass size={19} color={color.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={user ? 'Your CyKrome Account' : 'Sign in'} onPress={() => router.push('/account')}
          style={[styles.avatar, !user && { backgroundColor: color.neutral[800] }]}>
          <Text weight="semibold" size={13} tone={user ? color.accentRamp[200] : color.neutral[300]}>{user ? initials(user) : '?'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 24, gap: 10 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accentRamp[400] },
  iconBtn: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: color.divider, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: color.divider },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20 },
  track: { gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  topBar: { position: 'absolute', left: 20, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10 },
  mark: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  markDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, shadowColor: color.accent, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(color.bg, 0.4), alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.accentRamp[800], alignItems: 'center', justifyContent: 'center' },
});
