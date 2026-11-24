import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Empty } from '../components/Ui';
import { useAuth } from '../auth/AuthContext';
import { WEB_URL } from '../config';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;

/** "+" (N4 makes it native: chapisho, Moment, Makala, tangazo, huduma, tuma mzigo). */
export function CreateScreen({ navigation }: P) {
  const { user } = useAuth();
  const go = (title: string, path: string) => navigation.replace('Web', { url: `${WEB_URL}${path}`, title });
  if (!user) return <Empty title="Unda" text="Ingia kuchapisha." action={<Button title="Ingia" onPress={() => navigation.replace('Login')} />} />;
  return (
    <ScrollView contentContainerStyle={s.list}>
      {[['Chapisho au Makala', '/'], ['Weka tangazo', null], ['Weka huduma', '/p/PostService'], ['Tuma mzigo', '/p/SendShipment']].map(([t, p]) => (
        <Button key={t} title={t} dark={false} onPress={() => (p ? go(t, p) : navigation.replace('CreateClassified'))} />
      ))}
    </ScrollView>
  );
}


const s = StyleSheet.create({
  list: { padding: 16, gap: 10, backgroundColor: '#fff' },
  wrap: { flex: 1, padding: 24, gap: 12, backgroundColor: '#fff' },
});
export const _colors = colors;
