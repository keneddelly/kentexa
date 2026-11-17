import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { mediaUrl } from '../config';
import { F, colors } from '../theme';

/**
 * Moments at the top of Mwanzo (#422 N1, owner approved look): one circle per business or person
 * with a new Moment, a coloured ring until opened (then grey, remembered on the phone), and "Yako"
 * first with "+" to post your own. Same data as the web (/feed/moments/stories).
 */
type Story = { momentId: number; imageUrl?: string | null; business?: { id?: number; name?: string | null; storeName?: string | null; logo?: string | null; displayName?: string | null; photoUrl?: string | null } };
const SEEN_KEY = 'kx_seen_moments';

const Ring = ({ seen, size = 68 }: { seen: boolean; size?: number }) => (
  <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
    <Defs>
      <LinearGradient id="g" x1="0" y1="1" x2="1" y2="0">
        <Stop offset="0" stopColor="#1d4ed8" /><Stop offset="0.5" stopColor="#60a5fa" /><Stop offset="1" stopColor="#0f766e" />
      </LinearGradient>
    </Defs>
    <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1.5} stroke={seen ? colors.border : 'url(#g)'} strokeWidth={seen ? 1.5 : 3} fill="none" />
  </Svg>
);

export default function MomentsRow({ refreshKey }: { refreshKey: number }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [seen, setSeen] = useState<Set<number>>(new Set());

  useEffect(() => {
    SecureStore.getItemAsync(SEEN_KEY).then((v) => { try { setSeen(new Set(JSON.parse(v || '[]'))); } catch { /* none */ } }).catch(() => {});
  }, []);
  useEffect(() => {
    api.get('/feed/moments/stories').then((r: any) => setStories(Array.isArray(r) ? r.slice(0, 20) : [])).catch(() => {});
  }, [refreshKey]);

  const open = (st: Story) => {
    const next = new Set(seen); next.add(st.momentId);
    setSeen(next);
    SecureStore.setItemAsync(SEEN_KEY, JSON.stringify([...next].slice(-200))).catch(() => {});
    nav.navigate('Post', { id: st.momentId });
  };

  if (!stories.length && !user) return null;
  const ordered = [...stories].sort((a, b) => Number(seen.has(a.momentId)) - Number(seen.has(b.momentId)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={s.wrap}>
      <Pressable style={s.item} onPress={() => (user ? nav.navigate('Create') : nav.navigate('Login'))} accessibilityLabel="Weka Moment yako">
        <View style={s.circle}>
          <Ring seen />
          {user?.avatarUrl ? <Image source={{ uri: mediaUrl(user.avatarUrl as string) || undefined }} style={s.photo} /> : <View style={[s.photo, { backgroundColor: colors.line }]} />}
          <View style={s.plus}><Text style={s.plusText}>+</Text></View>
        </View>
        <Text style={s.label} numberOfLines={1}>Yako</Text>
      </Pressable>
      {ordered.map((st) => {
        const b = st.business || {};
        const name = b.displayName || b.storeName || b.name || 'KenteXa';
        const photo = mediaUrl(b.photoUrl || b.logo || st.imageUrl);
        return (
          <Pressable key={st.momentId} style={s.item} onPress={() => open(st)} accessibilityLabel={`Moment ya ${name}`}>
            <View style={s.circle}>
              <Ring seen={seen.has(st.momentId)} />
              {photo ? <Image source={{ uri: photo }} style={s.photo} contentFit="cover" /> : <View style={[s.photo, { backgroundColor: colors.brand }]} />}
            </View>
            <Text style={s.label} numberOfLines={1}>{name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#fff' },
  row: { paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  item: { width: 70, alignItems: 'center', gap: 6 },
  circle: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 58, height: 58, borderRadius: 29 },
  plus: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#fff', fontFamily: F.bold, fontSize: 14, lineHeight: 16 },
  label: { fontSize: 12, fontFamily: F.regular, color: colors.ink, maxWidth: 70 },
});
