import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { WEB_URL } from '../config';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;

type Mode = 'biashara' | 'bidhaa';

/** A business found by its name or username (GET /profiles/search, the same call the web makes). */
interface BusinessHit {
  id: number;
  ownerId: number;
  displayName: string;
  username: string | null;
  followersCount: number | null;
}

/** A product (GET /products/search, the same call the web makes). */
interface ProductHit {
  id: number;
  name: string;
  displayPrice: number | string | null;
  images?: string[] | null;
  seller?: { name?: string | null; storeName?: string | null } | null;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;

/** 1500000 -> "1,500,000" (no Intl dependency, so it works the same on every phone). */
const money = (value: number | string | null | undefined) => {
  const n = Math.round(Number(value) || 0);
  return `TZS ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Tafuta, native: search businesses (Biashara) or products (Bidhaa) on the phone. Each result
 * opens its web page. Classifieds, services and hotels stay in the web search, from the button at the bottom.
 */
export default function SearchScreen({ navigation }: P) {
  const [mode, setMode] = useState<Mode>('biashara');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    setHits([]);
    setError('');
    if (q.length < MIN_CHARS) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const rows: any = await api.get(mode === 'biashara' ? '/profiles/search' : '/products/search', { q });
        if (cancelled) return;
        setHits(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setError('Utafutaji umeshindikana. Jaribu tena.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, mode]);

  const openBusiness = (h: BusinessHit) => {
    navigation.navigate('Web', { url: `${WEB_URL}/p/CommerceProfile-${h.ownerId}`, title: h.displayName });
  };
  const openProduct = (p: ProductHit) => {
    navigation.navigate('Web', { url: `${WEB_URL}/p/ProductDetail-${p.id}`, title: p.name });
  };

  const tabs: Array<[Mode, string]> = [['biashara', 'Biashara'], ['bidhaa', 'Bidhaa']];

  return (
    <View style={s.wrap}>
      <View style={s.tabs}>
        {tabs.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === key }}
            onPress={() => setMode(key)}
            style={[s.tab, mode === key && s.tabOn]}
          >
            <Text style={[s.tabText, mode === key && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={s.input}
        value={query}
        onChangeText={setQuery}
        placeholder={mode === 'biashara' ? 'Tafuta biashara au mtu' : 'Tafuta bidhaa'}
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Tafuta"
      />

      {busy && <ActivityIndicator style={s.spin} color={colors.muted} />}
      {!!error && <Text style={[type.meta, s.note]}>{error}</Text>}

      <FlatList
        data={hits}
        keyExtractor={(h) => `${mode}-${h.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.list}
        ListEmptyComponent={
          query.trim().length >= MIN_CHARS && !busy && !error
            ? <Text style={[type.meta, s.note]}>{mode === 'biashara' ? 'Hakuna biashara' : 'Hakuna bidhaa'} iliyopatikana kwa "{query.trim()}".</Text>
            : null
        }
        renderItem={({ item }) => mode === 'biashara' ? (
          <Pressable accessibilityRole="button" onPress={() => openBusiness(item)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
            <Text style={type.body}>{item.displayName}</Text>
            <Text style={type.meta}>
              {item.username ? `@${item.username}` : ''}
              {item.followersCount ? `${item.username ? ' · ' : ''}wafuasi ${item.followersCount}` : ''}
            </Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => openProduct(item)} style={({ pressed }) => [s.productRow, pressed && { opacity: 0.7 }]}>
            {item.images?.[0]
              ? <Image source={{ uri: item.images[0] }} style={s.thumb} />
              : <View style={[s.thumb, s.thumbEmpty]} />}
            <View style={s.productText}>
              <Text style={type.body} numberOfLines={2}>{item.name}</Text>
              <Text style={type.meta} numberOfLines={1}>{money(item.displayPrice)}</Text>
              {!!(item.seller?.storeName || item.seller?.name) && (
                <Text style={type.meta} numberOfLines={1}>{item.seller?.storeName || item.seller?.name}</Text>
              )}
            </View>
          </Pressable>
        )}
      />

      <Button
        title="Tafuta huduma, matangazo na hoteli kwenye ukurasa"
        dark={false}
        onPress={() => navigation.navigate('Web', { url: `${WEB_URL}/p/Search`, title: 'Tafuta' })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 12, gap: 8 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontFamily: 'Inter-Bold', color: colors.ink, fontSize: 14 },
  tabTextOn: { color: '#fff' },
  input: {
    minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.ink,
  },
  spin: { marginVertical: 8 },
  note: { textAlign: 'center', padding: 16 },
  list: { gap: 2, flexGrow: 1 },
  row: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  productRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.soft },
  thumbEmpty: { backgroundColor: colors.soft },
  productText: { flex: 1, minWidth: 0, gap: 2 },
});
