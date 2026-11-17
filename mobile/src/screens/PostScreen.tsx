import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import PostRow, { Post, ago } from '../components/PostRow';
import { Empty } from '../components/Ui';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type Comment = { id: number; body?: string; createdAt?: string; author?: { name?: string | null } | null; authorName?: string | null };

/** One post and its replies (#422 N0, read only; N1 adds replying, likes and Makala). Opened from links too. */
export default function PostScreen({ route }: NativeStackScreenProps<RootStackParams, 'Post'>) {
  const id = Number(route.params.id);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    api.get(`/feed/${id}`).then((p: any) => { if (alive) { setPost(p); setState('ready'); } }).catch(() => alive && setState('missing'));
    api.get(`/feed/${id}/comments`).then((c: any) => { if (alive) setComments(Array.isArray(c) ? c : Array.isArray(c?.items) ? c.items : []); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  if (state === 'loading') return <View style={s.center}><ActivityIndicator color={colors.ink} /></View>;
  if (state === 'missing' || !post) return <Empty title="Chapisho hili halipatikani" />;
  return (
    <FlatList
      style={{ backgroundColor: '#fff' }}
      data={comments}
      keyExtractor={(c) => String(c.id)}
      ListHeaderComponent={<PostRow post={post} />}
      renderItem={({ item }) => (
        <View style={s.comment}>
          <Text style={type.name}>{item.author?.name || item.authorName || 'Mtumiaji'} <Text style={type.meta}>· {ago(item.createdAt)}</Text></Text>
          <Text style={type.body}>{item.body}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={[type.meta, { padding: 16 }]}>Bado hakuna majibu.</Text>}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  comment: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 3 },
});
