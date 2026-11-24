import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { WEB_URL } from '../config';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;

/** A business found by its name or username (GET /profiles/search, the same call the web makes). */
interface BusinessHit {
  id: number;
  ownerId: number;
  displayName: string;
  username: string | null;
  followersCount: number | null;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;

/**
 * Tafuta, native (N3, first part): search businesses on the phone. Products, classifieds,
 * services and hotels still open in the web search, from the button at the bottom.
 */
export default function SearchScreen({ navigation }: P) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BusinessHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setHits([]);
      setError('');
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const rows: any = await api.get('/profiles/search', { q });
        if (cancelled) return;
        setHits(Array.isArray(rows) ? rows : []);
        setError('');
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
  }, [query]);

  const openBusiness = (h: BusinessHit) => {
    navigation.navigate('Web', { url: `${WEB_URL}/p/CommerceProfile-${h.ownerId}`, title: h.displayName });
  };

  return (
    <View style={s.wrap}>
      <TextInput
        style={s.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Tafuta biashara, mtu au huduma"
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Tafuta"
      />

      {busy && <ActivityIndicator style={s.spin} color={colors.muted} />}
      {!!error && <Text style={[type.meta, s.note]}>{error}</Text>}

      <FlatList
        data={hits}
        keyExtractor={(h) => String(h.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.list}
        ListEmptyComponent={
          query.trim().length >= MIN_CHARS && !busy && !error
            ? <Text style={[type.meta, s.note]}>Hakuna biashara iliyopatikana kwa "{query.trim()}".</Text>
            : null
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => openBusiness(item)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
            <Text style={type.body}>{item.displayName}</Text>
            <Text style={type.meta}>
              {item.username ? `@${item.username}` : ''}
              {item.followersCount ? `${item.username ? ' · ' : ''}wafuasi ${item.followersCount}` : ''}
            </Text>
          </Pressable>
        )}
      />

      <Button
        title="Tafuta bidhaa na huduma kwenye ukurasa"
        dark={false}
        onPress={() => navigation.navigate('Web', { url: `${WEB_URL}/p/Search`, title: 'Tafuta' })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 12, gap: 8 },
  input: {
    minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.ink,
  },
  spin: { marginVertical: 8 },
  note: { textAlign: 'center', padding: 16 },
  list: { gap: 2, flexGrow: 1 },
  row: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
