import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import PostRow, { Post } from '../components/PostRow';
import { Button, Empty } from '../components/Ui';
import { colors } from '../theme';
import type { RootStackParams } from '../navigation/types';

/** Mwanzo (#422 N0): the real "For you" feed, pull to refresh, more on scroll. N1 brings the full Home. */
export default function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p: number) => {
    try {
      const r: any = await api.get('/feed', { filter: 'for_you', page: p });
      const list: Post[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
      setItems((prev) => (p === 1 ? list : [...prev, ...list.filter((i) => !prev.some((x) => x.id === i.id))]));
      setMore(list.length >= 15);
      setPage(p);
      setState('ready');
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia.');
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  if (state === 'loading') return <View style={s.center}><ActivityIndicator color={colors.ink} /></View>;
  if (state === 'error') return <Empty title="Imeshindikana kupakia" text={error} action={<Button title="Jaribu tena" onPress={() => { setState('loading'); load(1); }} />} />;

  return (
    <FlatList
      style={{ backgroundColor: '#fff' }}
      data={items}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => <PostRow post={item} onPress={() => navigation.navigate('Post', { id: item.id })} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(1); setRefreshing(false); }} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => { if (more) load(page + 1); }}
      ListEmptyComponent={<Empty title="Bado hakuna machapisho" />}
      ListFooterComponent={more && items.length ? <ActivityIndicator style={{ padding: 16 }} color={colors.muted} /> : <Text style={s.end}> </Text>}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  end: { padding: 16 },
});
