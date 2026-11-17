import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, type } from '../theme';
import { mediaUrl } from '../config';
import Icon from './Icon';

/** One post in a list (N0: the plain card; N1 brings the full Home card). Always shows who posted. */
export type Post = {
  id: number; title?: string | null; body?: string | null; intent?: string | null; createdAt?: string;
  imageUrl?: string | null; data?: { images?: string[] } | null;
  commentCount?: number; likeCount?: number; views?: number;
  business?: { id?: number; name?: string | null; storeName?: string | null; logo?: string | null; isVerified?: boolean } | null;
  community?: { name?: string | null } | null;
};

const TAGS: Record<string, string> = { question: 'Swali', discussion: 'Mjadala', experience: 'Uzoefu', article: 'Makala', poll: 'Kura', update: 'Habari' };

export const ago = (iso?: string) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'sasa hivi';
  if (s < 3600) return `dk ${Math.floor(s / 60)}`;
  if (s < 86400) return `saa ${Math.floor(s / 3600)}`;
  return `siku ${Math.floor(s / 86400)}`;
};

export default function PostRow({ post, onPress }: { post: Post; onPress?: () => void }) {
  const who = post.business?.storeName || post.business?.name || 'KenteXa';
  const logo = mediaUrl(post.business?.logo);
  const image = mediaUrl(post.imageUrl || post.data?.images?.[0]);
  const title = (post.title || '').trim();
  const body = (post.body || '').trim();
  const text = title && body && body !== title ? `${title}\n${body}` : (title || body);
  const tag = post.intent ? TAGS[post.intent] : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.soft }]} accessibilityRole="button">
      {logo ? <Image source={{ uri: logo }} style={s.avatar} contentFit="cover" /> : <View style={[s.avatar, s.avatarEmpty]}><Text style={s.initial}>{who.slice(0, 1).toUpperCase()}</Text></View>}
      <View style={s.main}>
        <View style={s.head}>
          <Text style={type.name} numberOfLines={1}>{who}</Text>
          <Text style={type.meta} numberOfLines={1}> · {ago(post.createdAt)}</Text>
        </View>
        {tag || post.community?.name ? <Text style={s.tag}>{[tag, post.community?.name].filter(Boolean).join(' · ')}</Text> : null}
        {text ? <Text style={type.body} numberOfLines={8}>{text}</Text> : null}
        {image ? <Image source={{ uri: image }} style={s.photo} contentFit="cover" transition={150} /> : null}
        <View style={s.counts}>
          <View style={s.count}><Icon name="comment" size={17} color={colors.muted} /><Text style={type.meta}>{post.commentCount || 0}</Text></View>
          <View style={s.count}><Icon name="heart" size={17} color={colors.muted} /><Text style={type.meta}>{post.likeCount || 0}</Text></View>
          {post.views ? <View style={s.count}><Icon name="eye" size={17} color={colors.muted} /><Text style={type.meta}>{post.views}</Text></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#fff' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarEmpty: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '800', fontSize: 16 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center' },
  tag: { fontSize: 13, color: colors.brand, fontWeight: '700' },
  photo: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14, marginTop: 6, backgroundColor: colors.line },
  counts: { flexDirection: 'row', gap: 22, marginTop: 6 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
