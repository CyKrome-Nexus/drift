import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WallpaperId } from '@drift/core';
import { color } from '@drift/tokens';
import { TabScreen } from '../../components/TabScreen';
import { Eyebrow, Text } from '../../components/Text';
import { WallpaperCard } from '../../components/WallpaperCard';
import { useKnown } from '../../lib/catalog';
import { useApp } from '../../lib/store';

function Shelf({ title, ids, empty }: { title: string; ids: WallpaperId[]; empty: string }) {
  const items = useKnown(ids);
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow style={{ paddingHorizontal: 20 }}>{title} · {ids.length}</Eyebrow>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingVertical: 8 }}>
          {items.map((w) => <WallpaperCard key={w.id} w={w} width={124} height={220} />)}
        </ScrollView>
      ) : (
        <View style={{ marginHorizontal: 20, padding: 24, borderRadius: 14, borderWidth: 1, borderColor: color.divider }}>
          <Text size={14} tone={color.neutral[400]} style={{ textAlign: 'center' }}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

export default function Library() {
  const insets = useSafeAreaInsets();
  const favs = useApp((s) => s.favs);
  const lists = useApp((s) => s.lists);
  return (
    <TabScreen route="library" style={{ backgroundColor: color.bg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 130, gap: 22 }}>
      <Text weight="medium" size={30} style={{ paddingHorizontal: 20 }}>Library</Text>
      <Shelf title="Favourites" ids={favs} empty="Tap the heart on any wallpaper to keep it here." />
      {lists.map((l) => <Shelf key={l.id} title={l.name} ids={l.items} empty={`Nothing in ${l.name} yet. Use “Add to list” on a wallpaper.`} />)}
    </ScrollView>
    </TabScreen>
  );
}
