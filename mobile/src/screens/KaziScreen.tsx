import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../components/Icon';
import { colors, type } from '../theme';
import { WEB_URL } from '../config';
import type { RootStackParams } from '../navigation/types';

/**
 * Kazi (#422): the tools hub. Tools that are not native yet open their kentexa.com page inside the
 * app. POS is its own app later (owner 2026-11-18); until then it opens the web POS.
 */
const TOOLS: Array<[string, string, string]> = [
  ['Maduka yangu', 'Bidhaa, oda na mauzo', '/p/MyBusinesses'],
  ['POS', 'Uza dukani (app ya POS inakuja)', '/p/POS'],
  ['Tuma mzigo', 'Tuma au fuatilia mzigo', '/p/SendShipment'],
  ['Ofisi', 'Pokea na tuma mizigo', '/p/SuperAgentDashboard'],
  ['Oda zangu', 'Ulichonunua', '/p/MyOrders'],
];

export default function KaziScreen({ navigation }: NativeStackScreenProps<RootStackParams>) {
  return (
    <ScrollView style={{ backgroundColor: '#fff' }}>
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
      <Text style={s.note}>Zana hizi zinafunguka kama ukurasa wa KenteXa ndani ya app. Zitakuwa za app kamili hatua kwa hatua.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  note: { padding: 16, fontSize: 13, fontFamily: 'Inter-Regular', color: colors.muted, lineHeight: 18 },
});
