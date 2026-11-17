import React, { useRef, useState } from 'react';
import { Animated, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import ImageView from 'react-native-image-viewing';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { F, colors, type } from '../theme';
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
  business?: { id?: number; name?: string | null; storeName?: string | null; logo?: string | null; isVerified?: boolean; username?: string | null; isFollowing?: boolean } | null;
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
      <Text style={{ color: '#fff', fontFamily: F.black, fontSize: size * 0.4 }}>{(name || 'K').slice(0, 1).toUpperCase()}</Text>
    </View>;
};

/**
 * Photos (#422 N1): tap opens them full screen (pinch to zoom, swipe down to close); a quick
 * double tap likes the post with a heart that pops, like Instagram.
 */
export function Photos({ photos, onDoubleTap }: { photos: Array<{ url: string }>; onDoubleTap?: () => void }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const [pop, setPop] = useState(0);
  const scale = useRef(new Animated.Value(0)).current;
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!photos.length) return null;
  const uris = photos.map((p) => ({ uri: mediaUrl(p.url) || '' }));

  const tap = (i: number) => {
    const now = Date.now();
    if (now - last.current < 280) {
      if (timer.current) clearTimeout(timer.current);
      last.current = 0;
      onDoubleTap?.();
      setPop((n) => n + 1);
      scale.setValue(0);
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0, duration: 220, delay: 380, useNativeDriver: true }),
      ]).start();
      return;
    }
    last.current = now;
    timer.current = setTimeout(() => setViewer(i), 290);
  };

  const heart = pop ? (
    <Animated.View pointerEvents="none" style={[s.pop, { opacity: scale, transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
      <Icon name="heart" size={96} color="#fff" fill="#fff" />
    </Animated.View>
  ) : null;

  return (
    <View>
      {photos.length === 1 ? (
        <Pressable onPress={() => tap(0)}><Image source={uris[0]} style={s.one} contentFit="cover" transition={150} /></Pressable>
      ) : (
        <View style={s.grid}>
          {photos.map((p, i) => (
            <Pressable key={p.url + i} onPress={() => tap(i)} style={[s.cell, photos.length === 3 && i === 0 ? { width: '100%' } : null]}>
              <Image source={uris[i]} contentFit="cover" transition={150} style={StyleSheet.absoluteFill} />
            </Pressable>
          ))}
        </View>
      )}
      {heart}
      <ImageView images={uris} imageIndex={viewer ?? 0} visible={viewer !== null} onRequestClose={() => setViewer(null)} swipeToCloseEnabled doubleTapToZoomEnabled />
    </View>
  );
}

function Action({ icon, count, active, color, onPress, label }: { icon: 'comment' | 'heart' | 'save' | 'share' | 'eye'; count?: number; active?: boolean; color?: string; onPress?: () => void; label: string }) {
  const c = active ? (color || colors.ink) : colors.muted;
  const bump = useRef(new Animated.Value(1)).current;
  const press = () => {
    if (icon === 'heart' || icon === 'save') {
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.3, duration: 90, useNativeDriver: true }),
        Animated.spring(bump, { toValue: 1, friction: 3, useNativeDriver: true }),
      ]).start();
    }
    onPress?.();
  };
  return (
    <Pressable onPress={press} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={s.action}>
      <Animated.View style={{ transform: [{ scale: bump }] }}>
        <Icon name={icon} size={18} color={c} fill={active && (icon === 'heart' || icon === 'save') ? c : 'none'} />
      </Animated.View>
      {count ? <Text style={[type.small, { color: c }]}>{count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K` : count}</Text> : null}
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
      <Action icon="heart" label="Penda" count={Math.max(0, (post.likeCount || 0) + likeDelta)} active={liked} color={colors.like} onPress={like} />
      <Action icon="save" label="Hifadhi" active={eng.saved(post.id)} color={colors.brand} onPress={save} />
      <Action icon="share" label="Shiriki" onPress={share} />
      {post.views ? <Action icon="eye" label="Waliotazama" count={post.views} /> : null}
    </View>
  );
  // A Makala's own page shows the reader above; here only its actions.
  if (detail && isArticle) return <View style={[s.card, { paddingVertical: 4 }]}><View style={s.main}>{actions}</View></View>;
  if (detail) return <DetailCard post={post} who={who} text={text} tag={tag} photos={photos} liked={liked} likeCount={Math.max(0, (post.likeCount || 0) + likeDelta)}
    saved={eng.saved(post.id)} onLike={like} onSave={save} onShare={share} />;

  return (
    <Pressable onPress={openPost} disabled={detail} style={({ pressed }) => [s.card, pressed && !detail && { backgroundColor: colors.soft }]}>
      <Avatar uri={post.business?.logo} name={who} size={44} />
      <View style={s.main}>
        <View style={s.head}>
          <Text style={[type.name, { flexShrink: 1 }]} numberOfLines={1}>{who}</Text>
          {post.business?.isVerified ? <View style={s.tick}><Icon name="check" size={10} color="#fff" strokeWidth={3.4} /></View> : null}
          <Text style={[type.meta, { flexShrink: 0 }]} numberOfLines={1}>{post.business?.username ? ` @${post.business.username}` : ''} · {ago(post.createdAt)}</Text>
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
              <Text style={[type.meta, { fontFamily: F.bold }]}>Dakika {readMinutes(body)} kusoma</Text>
            </View>
          </View>
        ) : (
          <>
            {text ? <Text style={detail ? type.big : type.body} numberOfLines={open ? undefined : 7}>{text}</Text> : null}
            {long && !open ? <Pressable onPress={() => setOpen(true)} hitSlop={6}><Text style={s.more}>Soma zaidi</Text></Pressable> : null}
            <Photos photos={photos} onDoubleTap={() => { if (!liked) like(); }} />
          </>
        )}

        {actions}
      </View>
    </Pressable>
  );
}

/** One post on its own page (#422 N1, like Twitter): who with Fuata, larger text, the date and views, the counts, then the actions. */
function DetailCard({ post, who, text, tag, photos, liked, likeCount, saved, onLike, onSave, onShare }: {
  post: Post; who: string; text: string; tag: string; photos: Array<{ url: string }>; liked: boolean; likeCount: number; saved: boolean;
  onLike: () => void; onSave: () => void; onShare: () => void;
}) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [following, setFollowing] = useState(Boolean(post.business?.isFollowing));
  const ownerId = post.businessId ?? post.business?.id;
  const mine = user && ownerId && Number(user.id) === Number(ownerId);
  const follow = async () => {
    if (!user) { nav.navigate('Login'); return; }
    if (!ownerId) return;
    setFollowing((f) => !f);
    try { const r: any = await api.post(`/stores/${ownerId}/follow`); if (typeof r?.following === 'boolean') setFollowing(r.following); } catch { setFollowing((f) => !f); }
  };
  const when = post.createdAt ? new Date(post.createdAt) : null;
  const n = (v?: number) => (v && v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(v || 0));
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar uri={post.business?.logo} name={who} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.head}>
            <Text style={[type.name, { flexShrink: 1 }]} numberOfLines={1}>{who}</Text>
            {post.business?.isVerified ? <View style={s.tick}><Icon name="check" size={10} color="#fff" strokeWidth={3.4} /></View> : null}
          </View>
          {post.business?.username ? <Text style={type.meta} numberOfLines={1}>@{post.business.username}</Text> : null}
        </View>
        {!mine && ownerId ? (
          <Pressable onPress={follow} style={[s.follow, following ? s.following : null]} accessibilityRole="button">
            <Text style={[s.followText, following ? { color: colors.ink } : null]}>{following ? 'Unafuata' : 'Fuata'}</Text>
          </Pressable>
        ) : null}
      </View>
      {(tag || post.community?.name) ? <Text style={s.pillTag}>{[tag, post.community?.name].filter(Boolean).join(' · ')}</Text> : null}
      {text ? <Text style={type.big} selectable>{text}</Text> : null}
      <Photos photos={photos} onDoubleTap={() => { if (!liked) onLike(); }} />
      <Text style={[type.meta, s.lineBox]}>
        {when ? `${when.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })} · ${when.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        {post.views ? <Text> · <Text style={{ fontFamily: F.bold, color: colors.ink }}>{n(post.views)}</Text> waliotazama</Text> : null}
      </Text>
      <Text style={[type.meta, s.lineBox]}>
        <Text style={{ fontFamily: F.bold, color: colors.ink }}>{n(post.commentCount)}</Text> Majibu{'   '}
        <Text style={{ fontFamily: F.bold, color: colors.ink }}>{n(likeCount)}</Text> Wamependa
      </Text>
      <View style={s.detailActions}>
        <Action icon="comment" label="Jibu" />
        <Action icon="heart" label="Penda" active={liked} color={colors.like} onPress={onLike} />
        <Action icon="save" label="Hifadhi" active={saved} color={colors.brand} onPress={onSave} />
        <Action icon="share" label="Shiriki" onPress={onShare} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#fff' },
  main: { flex: 1, minWidth: 0, gap: 5 },
  head: { flexDirection: 'row', alignItems: 'center' },
  tick: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { fontSize: 12, fontFamily: F.bold, color: colors.brand, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
  more: { color: colors.brand, fontFamily: F.bold, fontSize: 15 },
  one: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14, marginTop: 4, backgroundColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  cell: { width: '49.6%', aspectRatio: 1, backgroundColor: colors.line, overflow: 'hidden' },
  pop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  article: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.line },
  makala: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: TEAL, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  makalaText: { color: '#fff', fontSize: 11, fontFamily: F.black, letterSpacing: 0.4 },
  articleTitle: { fontSize: 18, fontFamily: F.black, color: colors.ink, lineHeight: 23 },
  follow: { height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  following: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  followText: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
  pillTag: { alignSelf: 'flex-start', fontSize: 12, fontFamily: F.bold, color: colors.brand, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  lineBox: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, marginTop: -4 },
  detailActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingRight: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 40 },
});
