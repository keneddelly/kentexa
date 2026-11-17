import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PostCard, { Avatar, Post, ago } from '../components/PostCard';
import ArticleView from '../components/ArticleView';
import Icon from '../components/Icon';
import { Empty } from '../components/Ui';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

/**
 * One post (#422 N1): the full card (or the Makala reader), replies with one level of answers,
 * Penda on a reply, and the reply box at the bottom ("Jibu" on a reply answers that person).
 * Guests read everything; replying asks them to sign in. Opened from links too.
 */
type Comment = {
  id: number; body?: string; createdAt?: string; helpfulCount?: number; likedByMe?: boolean; authorId?: number;
  author?: { name?: string | null; avatarUrl?: string | null; storeName?: string | null } | null;
  commerceProfile?: { displayName?: string | null; photoUrl?: string | null } | null;
  replies?: Comment[];
};

const identity = (c: Comment) => (c.commerceProfile
  ? { name: c.commerceProfile.displayName || c.author?.storeName || c.author?.name || 'Mtumiaji', photo: c.commerceProfile.photoUrl || c.author?.avatarUrl }
  : { name: c.author?.name || 'Mtumiaji', photo: c.author?.avatarUrl });

function CommentRow({ c, reply, ownerId, onReply, onLike, liked, count }: { c: Comment; reply?: boolean; ownerId?: number; onReply: () => void; onLike: () => void; liked: boolean; count: number }) {
  const who = identity(c);
  return (
    <View style={[s.comment, reply && { paddingLeft: 62 }]}>
      <Avatar uri={who.photo} name={who.name} size={reply ? 28 : 36} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={type.meta} numberOfLines={1}><Text style={type.name}>{who.name}</Text>{ownerId && c.authorId === ownerId ? ' · mwandishi' : ''} · {ago(c.createdAt)}</Text>
        <Text style={type.body}>{c.body}</Text>
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 4 }}>
          <Pressable onPress={onReply} hitSlop={8}><Text style={s.link}>Jibu</Text></Pressable>
          <Pressable onPress={onLike} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="heart" size={15} color={liked ? '#e0245e' : colors.muted} fill={liked ? '#e0245e' : 'none'} />
            <Text style={[s.link, liked && { color: '#e0245e' }]}>{count ? count : 'Penda'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function PostScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'Post'>) {
  const id = Number(route.params.id);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [likes, setLikes] = useState<Record<number, { liked: boolean; count: number }>>({});

  const loadComments = useCallback(() => api.get(`/feed/${id}/comments`)
    .then((c: any) => setComments(Array.isArray(c) ? c : Array.isArray(c?.items) ? c.items : [])).catch(() => {}), [id]);

  useEffect(() => {
    let alive = true;
    api.get(`/feed/${id}`).then((p: any) => {
      if (!alive) return;
      setPost(p); setState('ready');
      navigation.setOptions({ title: p?.intent === 'article' ? 'Makala' : 'Chapisho' });
    }).catch(() => alive && setState('missing'));
    loadComments();
    return () => { alive = false; };
  }, [id, loadComments, navigation]);

  const likeOf = (c: Comment) => likes[c.id] || { liked: Boolean(c.likedByMe), count: Number(c.helpfulCount || 0) };
  const like = async (c: Comment) => {
    if (!user) { navigation.navigate('Login'); return; }
    const cur = likeOf(c);
    const next = { liked: !cur.liked, count: Math.max(0, cur.count + (cur.liked ? -1 : 1)) };
    setLikes((m) => ({ ...m, [c.id]: next }));
    try {
      const r: any = await api.post(`/comments/${c.id}/helpful`);
      setLikes((m) => ({ ...m, [c.id]: { liked: Boolean(r?.helpful), count: Number(r?.helpfulCount ?? next.count) } }));
    } catch { setLikes((m) => ({ ...m, [c.id]: cur })); }
  };

  const send = async () => {
    if (!user) { navigation.navigate('Login'); return; }
    const body = text.trim();
    if (!body) return;
    setSending(true); setError('');
    try {
      await api.post(`/feed/${id}/comments`, { body, parentId: replyTo?.id });
      setText(''); setReplyTo(null);
      await loadComments();
    } catch (e: any) { setError(e?.message || 'Imeshindikana kutuma.'); } finally { setSending(false); }
  };

  if (state === 'loading') return <View style={s.center}><ActivityIndicator color={colors.ink} /></View>;
  if (state === 'missing' || !post) return <Empty title="Chapisho hili halipatikani" text="Huenda limefutwa au ni la wanaofuata tu." />;

  const ownerId = post.businessId ?? post.business?.id;
  const rows: Array<{ c: Comment; reply: boolean; root: Comment }> = [];
  comments.forEach((c) => { rows.push({ c, reply: false, root: c }); (c.replies || []).forEach((r) => rows.push({ c: r, reply: true, root: c })); });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.c.id)}
        ListHeaderComponent={<>{post.intent === 'article' ? <ArticleView post={post} /> : null}<PostCard post={post} detail /></>}
        renderItem={({ item }) => {
          const l = likeOf(item.c);
          return <CommentRow c={item.c} reply={item.reply} ownerId={ownerId} liked={l.liked} count={l.count}
            onLike={() => like(item.c)} onReply={() => setReplyTo({ id: item.root.id, name: identity(item.c).name })} />;
        }}
        ListEmptyComponent={<Text style={[type.meta, { padding: 16 }]}>Bado hakuna majibu. Kuwa wa kwanza kujibu.</Text>}
        keyboardShouldPersistTaps="handled"
      />
      <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {replyTo ? (
          <Pressable onPress={() => setReplyTo(null)}><Text style={type.meta}>Unamjibu <Text style={{ fontWeight: '700', color: colors.ink }}>{replyTo.name}</Text> · Ghairi</Text></Pressable>
        ) : null}
        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder={user ? 'Andika jibu lako' : 'Ingia ili kujibu'} placeholderTextColor={colors.muted}
            value={text} onChangeText={setText} multiline maxLength={2000} editable={!sending} onFocus={() => { if (!user) navigation.navigate('Login'); }} />
          <Pressable onPress={send} disabled={sending || !text.trim()} accessibilityLabel="Tuma jibu" style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  link: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  composer: { borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 12, paddingTop: 8, gap: 6, backgroundColor: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, backgroundColor: colors.soft, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: colors.ink },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
