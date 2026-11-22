import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PostCard, { Avatar, Post } from '../components/PostCard';
import MomentsRow from '../components/MomentsRow';
import { FeedSkeleton } from '../components/Skeleton';
import Icon from '../components/Icon';
import { Button, Empty } from '../components/Ui';
import { WEB_URL } from '../config';
import { F, colors } from '../theme';
import type { RootStackParams } from '../navigation/types';

/**
 * Mwanzo (#422 N1, owner approved look 2026-11-18):
 * - the header (avatar, KenteXa mark, Arifa bell) and the tabs hide while scrolling down and come
 *   back on the way up, so the posts get the screen;
 * - tabs Kwa ajili yako / Jumuiya / Karibu nawe, each keeping its own list;
 * - Moments row on top; grey card shapes while loading;
 * - "Machapisho mapya" appears when newer posts arrive, instead of the list jumping.
 */
const TABS = [['for_you', 'Kwa ajili yako'], ['communities', 'Jumuiya'], ['nearby', 'Karibu nawe']] as const;
type Filter = typeof TABS[number][0];
type Feed = { items: Post[]; page: number; more: boolean; state: 'loading' | 'ready' | 'error'; error?: string };
const fresh = (): Feed => ({ items: [], page: 1, more: true, state: 'loading' });
const HEADER = 48;
const TABS_H = 50;

export default function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('for_you');
  const [feeds, setFeeds] = useState<Record<Filter, Feed>>({ for_you: fresh(), communities: fresh(), nearby: fresh() });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newer, setNewer] = useState(false);
  const [bell, setBell] = useState(0);
  const listRef = useRef<any>(null);
  const feed = feeds[filter];
  const city = String((user as any)?.city || '');
  const top = insets.top;
  const total = top + HEADER + TABS_H;

  // Hide on scroll down, show on scroll up.
  const scrollY = useRef(new Animated.Value(0)).current;
  const clamped = Animated.diffClamp(scrollY, 0, HEADER + TABS_H);
  const translateY = clamped.interpolate({ inputRange: [0, HEADER + TABS_H], outputRange: [0, -(HEADER + TABS_H)], extrapolate: 'clamp' });

  const load = useCallback(async (f: Filter, p: number) => {
    try {
      const r: any = await api.get('/feed', { filter: f, page: p, city: f === 'nearby' ? city : undefined });
      const list: Post[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
      setFeeds((all) => {
        const prev = all[f].items;
        const items = p === 1 ? list : [...prev, ...list.filter((i) => !prev.some((x) => x.id === i.id))];
        return { ...all, [f]: { items, page: p, more: list.length >= 15, state: 'ready' } };
      });
      if (p === 1 && f === 'for_you') setNewer(false);
    } catch (e: any) {
      setFeeds((all) => ({ ...all, [f]: { ...all[f], state: all[f].items.length ? 'ready' : 'error', error: e?.message } }));
    }
  }, [city]);

  useEffect(() => { load('for_you', 1); }, [load]);
  useEffect(() => {
    const needs = (filter === 'communities' && user) || (filter === 'nearby' && city);
    if (needs && feeds[filter].state === 'loading') load(filter, 1);
  }, [filter, user, city, feeds, load]);
  useEffect(() => { setFeeds((all) => ({ ...all, communities: fresh(), nearby: fresh() })); }, [user]);

  // Newer posts: look once a minute; show the pill, never move the list.
  useEffect(() => {
    const t = setInterval(() => {
      const first = feeds.for_you.items[0];
      if (!first) return;
      api.get('/feed', { filter: 'for_you', page: 1 }).then((r: any) => {
        const list: Post[] = Array.isArray(r?.items) ? r.items : [];
        if (list.length && !feeds.for_you.items.some((x) => x.id === list[0].id)) setNewer(true);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, [feeds.for_you.items]);

  // Arifa: unread count for the bell.
  useEffect(() => {
    if (!user) { setBell(0); return; }
    api.get('/notifications/unread-count').then((r: any) => setBell(Number(r?.count) || 0)).catch(() => {});
  }, [user, refreshKey]);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await load(filter, 1);
    setRefreshing(false);
  };
  const showNewer = () => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    refresh();
  };

  let body: React.ReactNode = null;
  if (filter === 'communities' && !user) body = <Empty title="Jumuiya zako" text="Ingia kuona machapisho ya jumuiya ulizojiunga nazo." action={<Button title="Ingia" onPress={() => navigation.navigate('Login')} />} />;
  else if (filter === 'nearby' && !city) body = <Empty title="Karibu nawe" text={user ? 'Weka mji wako kwenye akaunti kuona machapisho ya karibu nawe.' : 'Ingia kuona machapisho ya karibu nawe.'} action={<Button title={user ? 'Weka mji' : 'Ingia'} onPress={() => (user ? navigation.navigate('Web', { url: `${WEB_URL}/p/MyProfile`, title: 'Akaunti' }) : navigation.navigate('Login'))} />} />;
  else if (feed.state === 'loading') body = <FeedSkeleton />;
  else if (feed.state === 'error') body = <Empty title="Imeshindikana kupakia" text={feed.error} action={<Button title="Jaribu tena" onPress={() => { setFeeds((a) => ({ ...a, [filter]: fresh() })); load(filter, 1); }} />} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Animated.FlatList
        ref={listRef}
        data={body ? [] : feed.items}
        keyExtractor={(p: Post) => `${filter}-${p.id}`}
        renderItem={({ item }: { item: Post }) => <PostCard post={item} />}
        ListHeaderComponent={filter === 'for_you' ? <MomentsRow refreshKey={refreshKey} /> : null}
        ListEmptyComponent={body ? <>{body}</> : <Empty title={filter === 'communities' ? 'Bado hakuna machapisho ya jumuiya zako' : 'Bado hakuna machapisho'} />}
        ListFooterComponent={!body && feed.more && feed.items.length ? <FeedSkeleton /> : <View style={{ height: 24 }} />}
        contentContainerStyle={{ paddingTop: total }}
        scrollIndicatorInsets={{ top: total }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} progressViewOffset={total} tintColor={colors.muted} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (!body && feed.more && feed.items.length) load(filter, feed.page + 1); }}
        removeClippedSubviews
        windowSize={9}
      />

      <Animated.View style={[s.header, { paddingTop: top, height: total, transform: [{ translateY }] }]}>
        <View style={s.bar}>
          <Pressable onPress={() => navigation.navigate(user ? 'Account' : 'Login')} hitSlop={10} accessibilityLabel={user ? 'Akaunti yako' : 'Ingia'}>
            {user ? <Avatar uri={user.avatarUrl as string} name={String(user.name || 'K')} size={32} /> : <Text style={s.signIn}>Ingia</Text>}
          </Pressable>
          <Image source={require('../../assets/icon.png')} style={s.logo} />
          <Pressable onPress={() => navigation.navigate(user ? 'Web' : 'Login', user ? { url: `${WEB_URL}/p/Activity`, title: 'Arifa' } as any : undefined)} hitSlop={10} accessibilityLabel="Arifa">
            <Icon name="bell" size={24} />
            {bell ? <View style={s.badge}><Text style={s.badgeText}>{bell > 99 ? '99+' : bell}</Text></View> : null}
          </Pressable>
        </View>
        <View style={s.tabs}>
          {TABS.map(([k, label]) => (
            <Pressable key={k} onPress={() => { if (k === filter) listRef.current?.scrollToOffset?.({ offset: 0, animated: true }); setFilter(k); }} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: filter === k }}>
              <Text style={[s.tabText, filter === k && s.tabOn]}>{label}</Text>
              <View style={[s.under, filter === k && { backgroundColor: colors.accent }]} />
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {newer && filter === 'for_you' ? (
        <Pressable onPress={showNewer} style={[s.pill, { top: total + 10 }]} accessibilityLabel="Onyesha machapisho mapya">
          <Text style={s.pillText}>↑  Machapisho mapya</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.97)', borderBottomWidth: 1, borderBottomColor: colors.line },
  bar: { height: HEADER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  logo: { width: 28, height: 28, borderRadius: 8 },
  signIn: { fontFamily: F.bold, color: colors.brand, fontSize: 15 },
  badge: { position: 'absolute', top: -5, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: F.bold },
  tabs: { height: TABS_H, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  tabText: { fontSize: 15, fontFamily: F.semi, color: colors.muted, paddingBottom: 12 },
  tabOn: { color: colors.ink, fontFamily: F.bold },
  under: { height: 4, width: 56, borderRadius: 2, backgroundColor: 'transparent' },
  pill: { position: 'absolute', alignSelf: 'center', backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, elevation: 6, shadowColor: colors.brand, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  pillText: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
});
