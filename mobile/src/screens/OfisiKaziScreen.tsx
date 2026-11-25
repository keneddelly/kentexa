import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { OFFICE_RULES } from '../office/officeRules';
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
type Tool = { title: string; line: string; darOnly?: boolean; go: { screen: 'OfisiBei' | 'OfisiSettings' | 'OfisiMapato' | 'OfisiWashirika' | 'OfisiTrack' | 'OfisiVan' } | { web: string } };
const TOOLS: Tool[] = [
  { title: 'Bei zangu', line: 'Bei za njia, kilo na kuchukua mzigo', go: { screen: 'OfisiBei' } },
  { title: 'Mapato na referral', line: 'Mapato ya leo, wiki na mwezi', go: { screen: 'OfisiMapato' } },
  { title: 'Washirika', line: 'Msafirishaji unayefanya naye kazi', go: { screen: 'OfisiWashirika' } },
  { title: 'Fuatilia mzigo', line: 'Historia, risiti na SMS', go: { screen: 'OfisiTrack' } },
  { title: OFFICE_RULES.vanDesk.title, line: 'Mizigo ya Van, Dar es Salaam', darOnly: true, go: { screen: 'OfisiVan' } },
  { title: 'Mipangilio ya ofisi', line: 'Jina, mji na hali ya ofisi', go: { screen: 'OfisiSettings' } },
  { title: 'Dashibodi ya ofisi', line: 'Tuma mzigo kwenye kivinjari', go: { web: '/p/SuperAgentDashboard' } },
];

export default function OfisiKaziScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  // Van Desk shows only for Dar offices, the same rule as the web tab.
  const [isDar, setIsDar] = useState(false);
  useEffect(() => {
    api.get<{ city?: string | null }>('/super-agents/my-profile')
      .then((p) => setIsDar(String(p?.city || '').toLowerCase().includes(OFFICE_RULES.vanDesk.cityMatch)))
      .catch(() => setIsDar(false));
  }, []);
  return (
    <ScrollView style={{ backgroundColor: '#fff' }}>
      <View style={s.head}>
        <Text style={type.title}>Kazi</Text>
        <Text style={type.meta}>Zana za ofisi yako</Text>
      </View>
      {TOOLS.filter((t) => !t.darOnly || isDar).map(({ title, line, go }) => (
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
