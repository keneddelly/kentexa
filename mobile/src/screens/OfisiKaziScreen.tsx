import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../components/Icon';
import { colors, type } from '../theme';
import { WEB_URL } from '../config';
import type { RootStackParams } from '../navigation/types';

/**
 * Kazi in the KenteXa Ofisi app: only the office's own tools. Nothing from the general app here
 * (no shops, POS, orders or classifieds).
 */
const TOOLS: Array<[string, string, string]> = [
  ['Dashibodi ya ofisi', 'Pokea, tuma na fuatilia mizigo', '/p/SuperAgentDashboard'],
  ['Mipangilio ya ofisi', 'Jina, eneo, bei na mawasiliano', '/p/SuperAgentSettings'],
];

export default function OfisiKaziScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  return (
    <ScrollView style={{ backgroundColor: '#fff' }}>
      <View style={s.head}>
        <Text style={type.title}>Kazi</Text>
        <Text style={type.meta}>Zana za ofisi yako</Text>
      </View>
      {TOOLS.map(([title, line, path]) => (
        <Pressable key={title} onPress={() => navigation.navigate('Web', { url: `${WEB_URL}${path}`, title })}
          style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.soft }]} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={type.name}>{title}</Text>
            <Text style={type.meta}>{line}</Text>
          </View>
          <Icon name="chevron" size={20} color={colors.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
});
