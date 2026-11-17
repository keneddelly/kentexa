import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Empty } from '../components/Ui';
import { useAuth } from '../auth/AuthContext';
import { WEB_URL } from '../config';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;

/** Tafuta (N3 makes it native: Bidhaa, Matangazo, Huduma, Hoteli, Biashara). */
export function SearchScreen({ navigation }: P) {
  return <Empty title="Tafuta" text="Bidhaa, matangazo, huduma, hoteli na biashara zinakuja hapa kwenye app." action={<Button title="Tafuta kwenye ukurasa" dark={false} onPress={() => navigation.navigate('Web', { url: `${WEB_URL}/p/Search`, title: 'Tafuta' })} />} />;
}

/** Inbox (N2 makes it native with live chat). */
export function InboxScreen({ navigation }: P) {
  const { user } = useAuth();
  if (!user) return <Empty title="Inbox" text="Ingia kuona ujumbe wako." action={<Button title="Ingia" onPress={() => navigation.navigate('Login')} />} />;
  return <Empty title="Inbox" text="Mazungumzo yako yanakuja hapa kwenye app." action={<Button title="Fungua Inbox" dark={false} onPress={() => navigation.navigate('Web', { url: `${WEB_URL}/p/SellerInbox`, title: 'Inbox' })} />} />;
}

/** "+" (N4 makes it native: chapisho, Moment, Makala, tangazo, huduma, tuma mzigo). */
export function CreateScreen({ navigation }: P) {
  const { user } = useAuth();
  const go = (title: string, path: string) => navigation.replace('Web', { url: `${WEB_URL}${path}`, title });
  if (!user) return <Empty title="Unda" text="Ingia kuchapisha." action={<Button title="Ingia" onPress={() => navigation.replace('Login')} />} />;
  return (
    <ScrollView contentContainerStyle={s.list}>
      {[['Chapisho au Makala', '/'], ['Weka tangazo', '/p/CreateClassified'], ['Weka huduma', '/p/PostService'], ['Tuma mzigo', '/p/SendShipment']].map(([t, p]) => (
        <Button key={t} title={t} dark={false} onPress={() => go(t, p)} />
      ))}
    </ScrollView>
  );
}

/** Akaunti: who is signed in, sign out, app version. */
export function AccountScreen({ navigation }: P) {
  const { user, signOut } = useAuth();
  return (
    <View style={s.wrap}>
      {user ? (
        <>
          <Text style={type.title}>{user.name || 'Akaunti yako'}</Text>
          <Text style={type.meta}>{user.email || user.phone || ''}</Text>
          <Button title="Toka" dark={false} onPress={async () => { await signOut(); navigation.goBack(); }} />
        </>
      ) : <Button title="Ingia" onPress={() => navigation.replace('Login')} />}
      <Text style={[type.meta, { marginTop: 24 }]}>KenteXa app</Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 10, backgroundColor: '#fff' },
  wrap: { flex: 1, padding: 24, gap: 12, backgroundColor: '#fff' },
});
export const _colors = colors;
