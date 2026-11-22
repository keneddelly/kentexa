import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { articleBlocks, articlePhotos, boldParts, readMinutes } from '../shared';
import { mediaUrl } from '../config';
import { F, colors, type } from '../theme';
import Icon from './Icon';
import { Avatar, Post, TEAL, ago } from './PostCard';

/**
 * A Makala on its own page (#422 N1), laid out by the same rules as the web (articleText.js):
 * cover, MAKALA and community, large title, writer and reading time, then the text in reading type
 * with sub-headings, lists, quotes, bold and photos inside. Ends with the writer's note.
 */
const Bold = ({ text, style }: { text: string; style?: any }) => (
  <Text style={style}>
    {boldParts(text).map((p: { text: string; bold: boolean }, i: number) => (p.bold ? <Text key={i} style={{ fontFamily: F.black }}>{p.text}</Text> : p.text))}
  </Text>
);

export default function ArticleView({ post }: { post: Post }) {
  const media = Array.isArray(post.media) && post.media.length ? post.media : (post.imageUrl ? [{ url: post.imageUrl }] : []);
  const { cover, photo } = articlePhotos(media, post.body);
  const who = post.business?.storeName || post.business?.name || 'KenteXa';
  return (
    <View style={s.wrap}>
      {cover ? <Image source={{ uri: mediaUrl(cover.url) || undefined }} style={s.cover} contentFit="cover" /> : null}
      <View style={s.inner}>
        <View style={s.row}>
          <View style={s.makala}><Icon name="book" size={12} color="#fff" strokeWidth={2.6} /><Text style={s.makalaText}>MAKALA</Text></View>
          {post.community?.name ? <Text style={type.meta}>{post.community.name}</Text> : null}
        </View>
        <Text style={s.title}>{post.title}</Text>
        <View style={s.row}>
          <Avatar uri={post.business?.logo} name={who} size={32} />
          <View>
            <Text style={type.name}>{who}</Text>
            <Text style={type.meta}>{ago(post.createdAt)} · dakika {readMinutes(post.body)} kusoma</Text>
          </View>
        </View>
        {articleBlocks(post.body).map((b: any, i: number) => {
          if (b.type === 'h') return <Bold key={i} text={b.text} style={s.h} />;
          if (b.type === 'ul') return <View key={i} style={{ gap: 6 }}>{b.items.map((it: string, j: number) => <View key={j} style={{ flexDirection: 'row', gap: 8 }}><Text style={s.read}>•</Text><Bold text={it} style={[s.read, { flex: 1 }]} /></View>)}</View>;
          if (b.type === 'quote') return <View key={i} style={s.quote}><Bold text={b.text} style={[s.read, { fontStyle: 'italic', color: '#3c4a55' }]} /></View>;
          if (b.type === 'photo') { const p = photo(b.index); return p ? <Image key={i} source={{ uri: mediaUrl(p.url) || undefined }} style={s.photo} contentFit="cover" /> : null; }
          return <Bold key={i} text={b.text} style={s.read} />;
        })}
        <Text style={[type.meta, { marginTop: 8 }]}>Maoni katika makala hii ni ya mwandishi.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.line },
  inner: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  makala: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: TEAL, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  makalaText: { color: '#fff', fontSize: 12, fontFamily: F.black, letterSpacing: 0.4 },
  title: { fontSize: 28, lineHeight: 34, fontFamily: F.black, color: colors.ink, letterSpacing: -0.5 },
  h: { fontSize: 21, lineHeight: 27, fontFamily: F.black, color: colors.ink, marginTop: 4 },
  read: { fontFamily: 'serif', fontSize: 18, lineHeight: 30, color: colors.ink },
  quote: { borderLeftWidth: 4, borderLeftColor: TEAL, paddingLeft: 14 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.line },
});
