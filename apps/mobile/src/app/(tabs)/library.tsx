import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { wallpaper } from '@drift/core';
import { color } from '@drift/tokens';
import { Eyebrow, Text } from '../../components/Text';
import { WallpaperCard } from '../../components/WallpaperCard';
import { useApp } from '../../lib/store';

function Shelf({ title, ids, empty }: { title: string; ids: number[]; empty: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow style={{ paddingHorizontal: 20 }}>{title} · {ids.length}</Eyebrow>
      {ids.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingVertical: 8 }}>
          {ids.map((id) => <WallpaperCard key={id} w={wallpaper(id)} width={124} height={220} />)}
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
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 130, gap: 22 }}>
      <Text weight="medium" size={30} style={{ paddingHorizontal: 20 }}>Library</Text>
      <Shelf title="Favourites" ids={favs} empty="Tap the heart on any wallpaper to keep it here." />
      {lists.map((l) => <Shelf key={l.id} title={l.name} ids={l.items} empty={`Nothing in ${l.name} yet. Use “Add to list” on a wallpaper.`} />)}
    </ScrollView>
  );
}
