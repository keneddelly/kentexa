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
/** Each tool opens a native screen ('screen') or the web page for the office ('web'). */
const TOOLS: Array<{ title: string; line: string; go: { screen: 'OfisiBei' | 'OfisiSettings' } | { web: string } }> = [
  { title: 'Bei zangu', line: 'Bei za njia, kilo na kuchukua mzigo', go: { screen: 'OfisiBei' } },
  { title: 'Mipangilio ya ofisi', line: 'Jina, mji na hali ya ofisi', go: { screen: 'OfisiSettings' } },
  { title: 'Dashibodi ya ofisi', line: 'Tuma mzigo kwenye kivinjari', go: { web: '/p/SuperAgentDashboard' } },
];

export default function OfisiKaziScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  return (
    <ScrollView style={{ backgroundColor: '#fff' }}>
      <View style={s.head}>
        <Text style={type.title}>Kazi</Text>
        <Text style={type.meta}>Zana za ofisi yako</Text>
      </View>
      {TOOLS.map(({ title, line, go }) => (
        <Pressable key={title}
          onPress={() => ('screen' in go
            ? navigation.navigate(go.screen as 'OfisiBei')
            : navigation.navigate('Web', { url: `${WEB_URL}${go.web}`, title }))}
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
