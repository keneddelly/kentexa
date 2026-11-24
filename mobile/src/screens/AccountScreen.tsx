import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Ui';
import { Avatar } from '../components/PostCard';
import { useAuth } from '../auth/AuthContext';
import { WEB_URL } from '../config';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;
export default function AccountScreen({ navigation }: P) {
  const { user, signOut } = useAuth();
  if (!user) return <View style={s.wrap}><Text style={[type.meta, s.center]}>Ingia ili kuona akaunti yako.</Text><Button title="Ingia" onPress={() => navigation.replace('Login')} /></View>;
  const open = (title: string, path: string) => navigation.navigate('Web', { url: `${WEB_URL}${path}`, title });
  const rows: Array<[string, string]> = [['Wasifu wangu', '/p/MyProfile'], ['Oda zangu', '/p/MyOrders']];
  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.body}>
      <View style={s.head}><Avatar uri={user.avatarUrl as string} name={String(user.name || 'K')} size={56} /><View style={s.headText}><Text style={type.title} numberOfLines={1}>{user.name || 'Akaunti yako'}</Text><Text style={type.meta} numberOfLines={1}>{user.phone || user.email || ''}</Text></View></View>
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate('NotificationSettings')} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}><Text style={type.body}>Arifa za Kentexa</Text><Text style={type.meta}>›</Text></Pressable>
      {rows.map(([title, path]) => <Pressable key={path} accessibilityRole="button" onPress={() => open(title, path)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}><Text style={type.body}>{title}</Text><Text style={type.meta}>›</Text></Pressable>)}
      <View style={s.signOut}><Button title="Toka" dark={false} onPress={async () => { await signOut(); navigation.goBack(); }} /></View>
      <Text style={[type.meta, s.center, { marginTop: 24 }]}>KenteXa app</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' }, body: { padding: 16, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  signOut: { marginTop: 24 }, center: { textAlign: 'center', padding: 16 },
});
