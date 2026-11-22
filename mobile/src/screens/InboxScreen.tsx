import React, { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Empty } from '../components/Ui';
import { useAuth } from '../auth/AuthContext';
import { type Convo, listConvos } from '../api/inbox';
import { colors, type } from '../theme';
import type { RootStackParams, TabParams } from '../navigation/types';

type P = CompositeScreenProps<BottomTabScreenProps<TabParams, 'Inbox'>, NativeStackScreenProps<RootStackParams>>;

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return d.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString('sw-TZ', { weekday: 'short' });
  return d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' });
};

/** Mazungumzo: the chats you started with shops and the chats your business receives. */
export default function InboxScreen({ navigation }: P) {
  const { user } = useAuth();
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try { setItems(await listConvos()); } catch { setFailed(true); } finally { setLoading(false); }
  }, []);

  // Refresh every time the tab is opened, so a new reply is there when you come back.
  useFocusEffect(useCallback(() => { if (user) load(); }, [user, load]));

  if (!user) {
    return <Empty title="Inbox" text="Ingia kuona ujumbe wako." action={<Button title="Ingia" onPress={() => navigation.navigate('Login')} />} />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => `${c._mode}-${c.id}`}
      contentContainerStyle={items.length ? undefined : s.emptyWrap}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.muted} />}
      ListEmptyComponent={
        <Empty title={failed ? 'Imeshindikana' : 'Hakuna mazungumzo bado'}
          text={failed ? 'Vuta chini kujaribu tena.' : 'Mazungumzo yako na wafanyabiashara na wateja yataonekana hapa.'} />
      }
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Thread', { mode: item._mode, id: item.id, title: item.title })}
          style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.soft }]}>
          {item.photo
            ? <Image source={{ uri: item.photo }} style={s.avatar} />
            : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarText}>{item.title.charAt(0).toUpperCase()}</Text></View>}
          <View style={s.body}>
            <View style={s.top}>
              <Text style={[type.name, item.unread ? s.unreadName : null]} numberOfLines={1}>{item.title}</Text>
              <Text style={[type.small, item.unread ? s.unreadTime : null]}>{when(item.lastAt)}</Text>
            </View>
            <View style={s.top}>
              <Text style={[type.meta, { flex: 1 }, item.unread ? s.unreadPreview : null]} numberOfLines={1}>{item.preview || '...'}</Text>
              {item.unread > 0 && <View style={s.badge}><Text style={s.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text></View>}
            </View>
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={s.sep} />}
    />
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'center', backgroundColor: '#fff' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.soft },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  avatarText: { fontFamily: 'Inter-Bold', fontSize: 18, color: colors.brand },
  body: { flex: 1, gap: 4, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadName: { fontFamily: 'Inter-ExtraBold' },
  unreadTime: { color: colors.brand, fontFamily: 'Inter-Bold' },
  unreadPreview: { color: colors.ink, fontFamily: 'Inter-SemiBold' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 74 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
});
