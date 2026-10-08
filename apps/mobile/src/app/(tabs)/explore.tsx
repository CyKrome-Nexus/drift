import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { CATEGORIES, catalog, search, type Category } from '@drift/core';
import { color, font } from '@drift/tokens';
import { Text } from '../../components/Text';
import { WallpaperCard } from '../../components/WallpaperCard';

const GAP = 12;
const PAD = 20;

export default function Explore() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<'All' | Category>('All');
  const items = query.trim() ? search(query) : catalog().filter((w) => cat === 'All' || w.category === cat);
  const cardW = (width - PAD * 2 - GAP) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + 16 }}>
      <View style={{ paddingHorizontal: PAD, gap: 12 }}>
        <Text weight="medium" size={30}>Explore</Text>
        <View style={styles.search}>
          <MagnifyingGlass size={17} color={color.neutral[400]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search wallpapers, creators"
            placeholderTextColor={color.neutral[500]}
            selectionColor={color.accent}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
          />
          {query ? <Pressable hitSlop={10} accessibilityLabel="Clear search" onPress={() => setQuery('')}><X size={16} color={color.neutral[400]} /></Pressable> : null}
        </View>
        {!query && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['All', ...CATEGORIES.map((c) => c.category)] as const).map((c) => (
              <Pressable key={c} onPress={() => setCat(c)} style={[styles.chip, cat === c && { backgroundColor: color.accentRamp[900], borderColor: color.accent }]}>
                <Text size={13} tone={cat === c ? color.accentRamp[200] : color.neutral[300]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(w) => String(w.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: PAD, gap: 18, paddingBottom: 130 }}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => <WallpaperCard w={item} width={cardW} height={cardW * 1.75} />}
        ListEmptyComponent={<Text tone={color.neutral[400]} style={{ textAlign: 'center', paddingTop: 40 }}>No wallpapers or creators match “{query}”.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider,
  },
  input: { flex: 1, color: color.text, fontFamily: font.regular, fontSize: 15 },
  chip: { height: 34, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: color.divider },
});
