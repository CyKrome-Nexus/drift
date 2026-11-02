import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeft,
  CheckSquare,
  CrownSimple,
  DeviceMobile,
  DotsThree,
  DownloadSimple,
  Heart,
  ListPlus,
  Pause,
  Play,
  Plus,
  SealCheck,
  ShareNetwork,
  Square,
  Star,
  Trophy,
} from 'phosphor-react-native';
import type { MobileSettings, Wallpaper, WallpaperId } from '@drift/core';
import { alpha, color } from '@drift/tokens';
import { Art } from '../../components/Art';
import { BlurTarget, Glass, GlassTarget, useBlurTargetRef } from '../../components/Glass';
import { Text } from '../../components/Text';
import { requirePro } from '../../lib/account';
import { useWallpaper } from '../../lib/catalog';
import { setState, toast, toggleFav, toggleFollow, updateSettings, useApp } from '../../lib/store';
import { applyWallpaper, downloadWallpaper } from '../../lib/wallpaper';

const TARGETS: Array<MobileSettings['applyTarget']> = ['Home', 'Lock', 'Both'];

function RoundGlass({ label, onPress, children }: { label: string; onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Glass radius={22} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{children}</Glass>
    </Pressable>
  );
}

function ListPicker({ id }: { id: WallpaperId }) {
  const lists = useApp((s) => s.lists);
  const toggle = (listId: string) =>
    setState((s) => ({ lists: s.lists.map((l) => (l.id !== listId ? l : { ...l, items: l.items.includes(id) ? l.items.filter((x) => x !== id) : [id, ...l.items] })) }));
  const create = () => {
    if (!requirePro.newList()) return;
    const name = `List ${lists.length + 1}`;
    setState((s) => ({ lists: [...s.lists, { id: `${Date.now()}`, name, items: [id] }] }));
    toast(`Added to “${name}”`);
  };
  return (
    <Glass radius={14} style={{ paddingVertical: 4 }}>
      {lists.map((l) => {
        const on = l.items.includes(id);
        return (
          <Pressable key={l.id} onPress={() => toggle(l.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.listRow}>
            {on ? <CheckSquare size={18} weight="fill" color={color.accent} /> : <Square size={18} color={color.accent} />}
            <Text size={14} style={{ flex: 1 }}>{l.name}</Text>
            <Text size={12} tone={color.neutral[500]}>{l.items.length}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={create} style={styles.listRow}>
        <Plus size={18} color={color.accent} />
        <Text size={14} tone={color.accent}>New list</Text>
      </Pressable>
    </Glass>
  );
}

/** Route params arrive decoded; an id that still looks encoded is decoded once more. */
export function routeId(raw: string | string[] | undefined): WallpaperId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    return /%[0-9A-Fa-f]{2}/.test(value) ? decodeURIComponent(value) : value;
  } catch {
    return value;
  }
}

export default function WallpaperScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const w = useWallpaper(routeId(raw));
  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
        {w === undefined ? <ActivityIndicator color={color.accent} /> : <Text>This wallpaper is no longer available.</Text>}
      </View>
    );
  }
  return <WallpaperView key={w.id} w={w} />;
}

function WallpaperView({ w }: { w: Wallpaper }) {
  const id = w.id;
  const insets = useSafeAreaInsets();
  const fav = useApp((s) => s.favs.includes(id));
  const target = useApp((s) => s.settings.applyTarget);
  const isPro = useApp((s) => s.account.plan.plan === 'pro');
  const following = useApp((s) => s.following);
  const notify = useApp((s) => s.settings.notifyFollowed);
  const applying = useApp((s) => s.applying === id);
  const [paused, setPaused] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const backdrop = useBlurTargetRef();
  const locked = w.tier === 'pro' && !isPro;
  const followed = following.includes(w.publisher);

  const actions = [
    { label: fav ? 'Favourited' : 'Favourite', icon: <Heart size={21} weight={fav ? 'fill' : 'regular'} color={color.accent} />, onPress: () => toggleFav(id) },
    { label: 'Add to list', icon: <ListPlus size={21} color={color.accent} />, onPress: () => setListsOpen((o) => !o) },
    { label: 'Download', icon: <DownloadSimple size={21} color={color.accent} />, onPress: () => downloadWallpaper(w) },
    {
      label: 'Share',
      icon: <ShareNetwork size={21} color={color.accent} />,
      onPress: () => void Share.share({ message: [`${w.name} by ${w.publisher} — a live wallpaper on Drift`, w.credit.sourceUrl].filter(Boolean).join('\n') }),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BlurTarget target={backdrop} style={StyleSheet.absoluteFill}>
        <Art w={w} paused={paused} />
        <LinearGradient colors={[alpha(color.bg, 0.55), alpha(color.bg, 0)]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }} />
      </BlurTarget>
      <GlassTarget target={backdrop}>

      <View style={[styles.topBar, { top: insets.top + 14 }]}>
        <RoundGlass label="Back" onPress={() => router.back()}><CaretLeft size={20} color={color.text} /></RoundGlass>
        <View style={{ flex: 1 }} />
        <RoundGlass label={paused ? 'Play preview' : 'Pause preview'} onPress={() => setPaused((p) => !p)}>
          {paused ? <Play size={18} weight="fill" color={color.text} /> : <Pause size={18} weight="fill" color={color.text} />}
        </RoundGlass>
        <RoundGlass label="More"><DotsThree size={20} color={color.text} /></RoundGlass>
      </View>

      <Glass radius={32} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
        <View style={styles.grabber} />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {w.rank !== undefined && w.rank <= 10 && (
            <View style={[styles.tag, { borderWidth: 1, borderColor: color.accent }]}>
              <Trophy size={11} weight="fill" color={color.accent} /><Text size={11} tone={color.accent}>#{w.rank} Trending</Text>
            </View>
          )}
          <View style={[styles.tag, { backgroundColor: color.neutral[800] }]}><Text size={11} tone={color.neutral[100]}>{w.category}</Text></View>
          {w.stats && (
            <View style={[styles.tag, { backgroundColor: color.neutral[800] }]}>
              <Star size={11} weight="fill" color={color.accent} /><Text size={11} tone={color.neutral[100]}>{w.stats.rating}</Text>
            </View>
          )}
          {w.tier === 'pro' && (
            <View style={[styles.tag, { backgroundColor: color.accentRamp[800] }]}>
              <CrownSimple size={11} weight="fill" color={color.accentRamp[100]} /><Text size={11} tone={color.accentRamp[100]}>Pro</Text>
            </View>
          )}
        </View>
        <Text weight="medium" size={30} style={{ lineHeight: 32 }}>{w.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.pubAvatar}><Text size={12} weight="semibold" tone={color.accentRamp[200]}>{w.initials}</Text></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text size={14}>{w.publisher}</Text>{!w.media && <SealCheck size={14} weight="fill" color={color.accent} />}
            </View>
            {w.stats ? (
              <Text size={11} tone={color.neutral[400]}>{w.stats.phoneRes} · {w.fps} fps · {w.stats.phoneSizeMb} MB</Text>
            ) : (
              // Credit, as the provider's terms ask.
              <Text size={11} tone={color.neutral[400]} onPress={() => void Linking.openURL(w.credit.sourceUrl ?? w.credit.providerUrl)}>
                {[w.res, w.loop && `${w.loop} loop`].filter(Boolean).join(' · ')} · {w.media?.kind === 'video' ? 'Video' : 'Image'}
                {w.credit.author ? ` by ${w.credit.author}` : ''} on <Text size={11} tone={color.neutral[200]} style={{ textDecorationLine: 'underline' }}>{w.credit.provider}</Text>
              </Text>
            )}
          </View>
          {!w.media && (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: followed }} onPress={() => {
              toggleFollow(w.publisher);
              if (!followed) toast(notify ? `Following ${w.publisher}` : `Following ${w.publisher} · turn on notifications in Settings to hear about new wallpapers`, notify ? 'ok' : 'info');
            }}>
              <Glass accent={followed} radius={8} style={{ height: 36, paddingHorizontal: 14, justifyContent: 'center' }}><Text size={13}>{followed ? 'Following' : 'Follow'}</Text></Glass>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {actions.map((a) => (
            <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} onPress={a.onPress} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
              <Glass radius={16} style={{ width: 56, height: 48, alignItems: 'center', justifyContent: 'center' }}>{a.icon}</Glass>
              <Text size={11} tone={color.neutral[300]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        {listsOpen && <ListPicker id={id} />}

        <Glass radius={14} style={{ flexDirection: 'row' }}>
          {TARGETS.map((t) => {
            const on = target === t;
            return (
              <Pressable key={t} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => updateSettings({ applyTarget: t })}
                style={[styles.target, on && { borderWidth: 1, borderColor: color.accent, borderRadius: 14 }]}>
                <Text size={13} tone={on ? color.accent : color.neutral[300]}>{t}</Text>
              </Pressable>
            );
          })}
        </Glass>

        <Pressable accessibilityRole="button" accessibilityState={{ busy: applying }} disabled={applying} onPress={() => void applyWallpaper(w)} style={({ pressed }) => (pressed || applying) && { opacity: 0.85 }}>
          <Glass accent radius={16} style={styles.cta}>
            {applying ? <ActivityIndicator color={color.text} /> : locked ? <CrownSimple size={18} weight="fill" color={color.text} /> : <DeviceMobile size={18} color={color.text} />}
            <Text weight="medium" size={15}>{locked ? 'Unlock with Drift Pro' : applying ? 'Setting wallpaper…' : 'Set as wallpaper'}</Text>
          </Glass>
        </Pressable>
      </Glass>
      </GlassTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 8, zIndex: 5 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 20, gap: 14,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.neutral[700] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  pubAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.accentRamp[800], alignItems: 'center', justifyContent: 'center' },
  target: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  cta: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
