import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PostCard, { Post } from '../components/PostCard';
import { Button, Empty } from '../components/Ui';
import { colors } from '../theme';
import type { RootStackParams } from '../navigation/types';

/**
 * Mwanzo (#422 N1): "Kwa ajili yako" and "Jumuiya" (the communities this person is in), the same
 * feeds as the web. Pull to refresh, more on scroll; each tab keeps its own list.
 */
const TABS = [['for_you', 'Kwa ajili yako'], ['communities', 'Jumuiya']] as const;
type Filter = typeof TABS[number][0];
type Feed = { items: Post[]; page: number; more: boolean; state: 'loading' | 'ready' | 'error'; error?: string };
const fresh = (): Feed => ({ items: [], page: 1, more: true, state: 'loading' });

export default function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('for_you');
  const [feeds, setFeeds] = useState<Record<Filter, Feed>>({ for_you: fresh(), communities: fresh() });
  const [refreshing, setRefreshing] = useState(false);
  const feed = feeds[filter];

  const load = useCallback(async (f: Filter, p: number) => {
    try {
      const r: any = await api.get('/feed', { filter: f, page: p });
      const list: Post[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
      setFeeds((all) => {
        const prev = all[f].items;
        const items = p === 1 ? list : [...prev, ...list.filter((i) => !prev.some((x) => x.id === i.id))];
        return { ...all, [f]: { items, page: p, more: list.length >= 15, state: 'ready' } };
      });
    } catch (e: any) {
      setFeeds((all) => ({ ...all, [f]: { ...all[f], state: all[f].items.length ? 'ready' : 'error', error: e?.message } }));
    }
  }, []);

  useEffect(() => { load('for_you', 1); }, [load]);
  useEffect(() => { if (filter === 'communities' && user && feeds.communities.state === 'loading') load('communities', 1); }, [filter, user, feeds.communities.state, load]);
  useEffect(() => { setFeeds((all) => ({ ...all, communities: fresh() })); }, [user]);

  const header = (
    <View style={s.tabs}>
      {TABS.map(([k, label]) => (
        <Pressable key={k} onPress={() => setFilter(k)} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: filter === k }}>
          <Text style={[s.tabText, filter === k && s.tabOn]}>{label}</Text>
          {filter === k ? <View style={s.bar} /> : null}
        </Pressable>
      ))}
    </View>
  );

  let body: React.ReactNode = null;
  if (filter === 'communities' && !user) body = <Empty title="Jumuiya zako" text="Ingia kuona machapisho ya jumuiya ulizojiunga nazo." action={<Button title="Ingia" onPress={() => navigation.navigate('Login')} />} />;
  else if (feed.state === 'loading') body = <ActivityIndicator style={{ padding: 32 }} color={colors.ink} />;
  else if (feed.state === 'error') body = <Empty title="Imeshindikana kupakia" text={feed.error} action={<Button title="Jaribu tena" onPress={() => { setFeeds((a) => ({ ...a, [filter]: fresh() })); load(filter, 1); }} />} />;

  return (
    <FlatList
      style={{ backgroundColor: '#fff' }}
      data={body ? [] : feed.items}
      keyExtractor={(p) => `${filter}-${p.id}`}
      renderItem={({ item }) => <PostCard post={item} />}
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(filter, 1); setRefreshing(false); }} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => { if (!body && feed.more && feed.items.length) load(filter, feed.page + 1); }}
      ListEmptyComponent={body ? <>{body}</> : <Empty title={filter === 'communities' ? 'Bado hakuna machapisho ya jumuiya zako' : 'Bado hakuna machapisho'} />}
      ListFooterComponent={!body && feed.more && feed.items.length ? <ActivityIndicator style={{ padding: 16 }} color={colors.muted} /> : null}
    />
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingTop: 14 },
  tabText: { fontSize: 15, fontWeight: '600', color: colors.muted, paddingBottom: 12 },
  tabOn: { color: colors.ink, fontWeight: '800' },
  bar: { height: 4, width: 56, borderRadius: 2, backgroundColor: colors.accent },
});
