import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { colors, type } from '../theme';
import { WEB_URL, mediaUrl } from '../config';
import { useAuth } from '../auth/AuthContext';
import { useEngagement } from '../api/engagement';
import { api } from '../api/client';
import { readMinutes, stripArticle } from '../shared';
import Icon from './Icon';

/**
 * The Home card (#422 N1), the same as the web: who posted (always first, tap opens them), the
 * format tag and community, the text with "Soma zaidi", up to 4 photos, and the actions: reply,
 * like, save, share and views. A Makala shows as a reading card (cover, MAKALA, title, start,
 * reading time).
 */
export type Post = {
  id: number; title?: string | null; body?: string | null; intent?: string | null; createdAt?: string;
  imageUrl?: string | null; media?: Array<{ url: string; width?: number | null; height?: number | null }> | null;
  commentCount?: number; likeCount?: number; saveCount?: number; views?: number; visibility?: string;
  business?: { id?: number; name?: string | null; storeName?: string | null; logo?: string | null; isVerified?: boolean; username?: string | null } | null;
  community?: { id?: number; name?: string | null } | null;
  writerOfWeek?: boolean;
  businessId?: number;
};

export const TEAL = '#0f766e';
const TAGS: Record<string, string> = { question: 'Swali', discussion: 'Mjadala', offer: 'Ofa', poll: 'Kura', experience: 'Uzoefu' };

export const ago = (iso?: string) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'sasa hivi';
  if (s < 3600) return `dk ${Math.floor(s / 60)}`;
  if (s < 86400) return `saa ${Math.floor(s / 3600)}`;
  if (s < 7 * 86400) return `siku ${Math.floor(s / 86400)}`;
  return new Date(iso).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' });
};

export const photosOf = (p: Post) => {
  const list = (Array.isArray(p.media) ? p.media : []).filter((m) => m && m.url);
  if (list.length) return list.slice(0, 4);
  return p.imageUrl ? [{ url: p.imageUrl }] : [];
};

export const postLink = (id: number) => `${WEB_URL}/post/${id}`;

export const Avatar = ({ uri, name, size = 40 }: { uri?: string | null; name: string; size?: number }) => {
  const src = mediaUrl(uri);
  return src ? <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.line }} contentFit="cover" />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{(name || 'K').slice(0, 1).toUpperCase()}</Text>
    </View>;
};

export function Photos({ photos }: { photos: Array<{ url: string }> }) {
  if (!photos.length) return null;
  if (photos.length === 1) return <Image source={{ uri: mediaUrl(photos[0].url) || undefined }} style={s.one} contentFit="cover" transition={150} />;
  return (
    <View style={s.grid}>
      {photos.map((p, i) => (
        <Image key={p.url + i} source={{ uri: mediaUrl(p.url) || undefined }} contentFit="cover" transition={150}
          style={[s.cell, photos.length === 3 && i === 0 ? { width: '100%' } : null]} />
      ))}
    </View>
  );
}

function Action({ icon, count, active, color, onPress, label }: { icon: 'comment' | 'heart' | 'save' | 'share' | 'eye'; count?: number; active?: boolean; color?: string; onPress?: () => void; label: string }) {
  const c = active ? (color || colors.ink) : colors.muted;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={s.action}>
      <Icon name={icon} size={18} color={c} fill={active && (icon === 'heart' || icon === 'save') ? c : 'none'} />
      {count ? <Text style={[type.meta, { color: c }]}>{count}</Text> : null}
    </Pressable>
  );
}

export default function PostCard({ post, detail = false }: { post: Post; detail?: boolean }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const eng = useEngagement();
  const [open, setOpen] = useState(detail);
  const [likeDelta, setLikeDelta] = useState(0);
  const who = post.business?.storeName || post.business?.name || 'KenteXa';
  const isArticle = post.intent === 'article';
  const title = (post.title || '').trim();
  const body = (post.body || '').trim();
  const text = isArticle ? '' : (title && body && body !== title ? `${title}\n${body}` : (title || body));
  const long = text.length > 280;
  const tag = isArticle ? '' : (post.intent ? TAGS[post.intent] || '' : '');
  const photos = photosOf(post);
  const liked = eng.liked(post.id);

  const openPost = () => { if (!detail) nav.navigate('Post', { id: post.id }); };
  const needLogin = () => { nav.navigate('Login'); };
  const like = async () => {
    if (!user) return needLogin();
    const before = liked;
    const now = await eng.toggle(post.id, 'like');
    if (now !== null && now !== before) setLikeDelta((d) => d + (now ? 1 : -1));
  };
  const save = () => (user ? eng.toggle(post.id, 'save') : needLogin());
  const share = async () => {
    try {
      await Share.share({ message: `${title || stripArticle(body).slice(0, 80) || who}\n${postLink(post.id)}` });
      if (user) api.post(`/feed/${post.id}/engage`, { type: 'share' }).catch(() => {});
    } catch { /* closed */ }
  };

  const actions = (
    <View style={s.actions}>
      <Action icon="comment" label="Jibu" count={post.commentCount} onPress={openPost} />
      <Action icon="heart" label="Penda" count={Math.max(0, (post.likeCount || 0) + likeDelta)} active={liked} color="#e0245e" onPress={like} />
      <Action icon="save" label="Hifadhi" active={eng.saved(post.id)} color={colors.brand} onPress={save} />
      <Action icon="share" label="Shiriki" onPress={share} />
      {post.views ? <Action icon="eye" label="Waliotazama" count={post.views} /> : null}
    </View>
  );
  // A Makala's own page shows the reader above; here only its actions.
  if (detail && isArticle) return <View style={[s.card, { paddingVertical: 4 }]}><View style={s.main}>{actions}</View></View>;

  return (
    <Pressable onPress={openPost} disabled={detail} style={({ pressed }) => [s.card, pressed && !detail && { backgroundColor: colors.soft }]}>
      <Avatar uri={post.business?.logo} name={who} />
      <View style={s.main}>
        <View style={s.head}>
          <Text style={[type.name, { flexShrink: 1 }]} numberOfLines={1}>{who}</Text>
          {post.business?.isVerified ? <View style={s.tick}><Icon name="check" size={10} color="#fff" strokeWidth={3.4} /></View> : null}
          <Text style={type.meta} numberOfLines={1}> · {ago(post.createdAt)}</Text>
        </View>
        {(tag || post.community?.name) ? (
          <View style={s.tags}>
            {tag ? <Text style={s.tag}>{tag}</Text> : null}
            {post.community?.name ? <Text style={type.meta} numberOfLines={1}>{post.community.name}</Text> : null}
          </View>
        ) : null}

        {isArticle ? (
          <View style={s.article}>
            {photos[0] ? <Image source={{ uri: mediaUrl(photos[0].url) || undefined }} style={s.cover} contentFit="cover" transition={150} /> : null}
            <View style={{ padding: 12, gap: 6 }}>
              <View style={s.makala}><Icon name="book" size={12} color="#fff" strokeWidth={2.6} /><Text style={s.makalaText}>MAKALA</Text></View>
              <Text style={s.articleTitle} numberOfLines={3}>{title}</Text>
              <Text style={type.meta} numberOfLines={2}>{stripArticle(body)}</Text>
              <Text style={[type.meta, { fontWeight: '700' }]}>Dakika {readMinutes(body)} kusoma</Text>
            </View>
          </View>
        ) : (
          <>
            {text ? <Text style={type.body} numberOfLines={open ? undefined : 7}>{text}</Text> : null}
            {long && !open ? <Pressable onPress={() => setOpen(true)} hitSlop={6}><Text style={s.more}>Soma zaidi</Text></Pressable> : null}
            <Photos photos={photos} />
          </>
        )}

        {actions}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#fff' },
  main: { flex: 1, minWidth: 0, gap: 5 },
  head: { flexDirection: 'row', alignItems: 'center' },
  tick: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { fontSize: 12, fontWeight: '800', color: colors.ink, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  more: { color: colors.brand, fontWeight: '700', fontSize: 15 },
  one: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14, marginTop: 4, backgroundColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  cell: { width: '49.6%', aspectRatio: 1, backgroundColor: colors.line },
  article: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.line },
  makala: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: TEAL, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  makalaText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  articleTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, lineHeight: 23 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingRight: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 40 },
});
