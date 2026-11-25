import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { WEB_URL } from '../config';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiWashirika'>;
const GREEN = '#15803d';
const BLUE = '#1d4ed8';
const R = OFFICE_RULES.partners;

interface Partner { id: number; name: string; relation?: 'own' | string; phone?: string | null }

/** Same Swahili invitation text and join link as the web (InviteCarrier.inviteMessage). */
export function inviteText(role: 'transport' | 'office', shopName: string) {
  return R.inviteMessage
    .replace('{shopName}', shopName || 'muuzaji')
    .replace('{route}', '')
    .replace('{as}', R.inviteAs[role])
    .replace('{origin}', WEB_URL)
    .replace('{join}', R.inviteJoinParam[role]);
}

/** 0712 345 678 -> 255712345678, as the web's tzPhone. Empty when the number is not Tanzanian. */
export function tzPhone(v: string) {
  const d = String(v || '').replace(/[^0-9]/g, '');
  if (/^255\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `255${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `255${d}`;
  return '';
}

/** Washirika: the transport this office works with, and a WhatsApp invitation from the office's phone. */
export default function OfisiWashirikaScreen({ route }: P) {
  const [shopName, setShopName] = useState((route.params as { shopName?: string } | undefined)?.shopName || '');
  const [list, setList] = useState<Partner[] | null>(null);
  const [role, setRole] = useState<'transport' | 'office'>('transport');
  const [phone, setPhone] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (!shopName) api.get<{ businessName?: string }>('/super-agents/my-profile').then((p) => setShopName(p?.businessName || '')).catch(() => {});
    api.get<{ transport?: Partner[] }>(R.endpoints.transportList.split(' ')[1])
      .then((r) => setList(r?.transport || []))
      .catch(() => setList([]));
  }, []);

  const invite = () => {
    const p = tzPhone(phone);
    const text = encodeURIComponent(inviteText(role, shopName));
    Linking.openURL(p ? `https://wa.me/${p}?text=${text}` : `https://wa.me/?text=${text}`);
  };

  return (
    <ScrollView contentContainerStyle={s.body}>
      <Text style={type.title}>Washirika</Text>
      <View style={s.box}>
        <Text style={type.name}>Alika mshirika</Text>
        <Text style={type.meta}>Ujumbe unatoka kwenye simu yako mwenyewe, kwa hiyo mshirika anakujua. KenteXa haitumi SMS.</Text>
        {!showInvite ? (
          <Pressable onPress={() => setShowInvite(true)} accessibilityRole="button">
            <Text style={[type.name, { color: BLUE }]}>+ Alika msafirishaji au ofisi unayefanya naye kazi</Text>
          </Pressable>
        ) : (
          <>
            <View style={s.chips}>
              {R.inviteRoles.map(([k, lbl]) => (
                <Pressable key={k} onPress={() => setRole(k as 'transport' | 'office')} accessibilityRole="radio"
                  style={[s.chip, role === k && s.chipOn]}>
                  <Text style={[s.chipText, role === k && { color: '#fff' }]}>{lbl}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={type.small}>Simu yake (hiari)</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0712 345 678" style={s.input} placeholderTextColor={colors.muted} />
            <Pressable onPress={invite} accessibilityRole="button" style={s.wa}>
              <Text style={s.waText}>Tuma mwaliko kwa WhatsApp</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={[type.small, { fontFamily: F.bold, marginTop: 4 }]}>USAFIRI UNAOFANYA NAO KAZI</Text>
      {list == null && <Text style={type.meta}>Inapakia…</Text>}
      {list && list.length === 0 && <Text style={type.meta}>Bado hakuna. Msafirishaji akijiunga kupitia mwaliko wako, au ukimtumia shehena, ataonekana hapa.</Text>}
      {(list || []).map((t) => (
        <View key={t.id} style={s.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.name}>{t.name}</Text>
            <Text style={type.small}>{t.relation === 'own' ? 'Usafiri wako' : 'Mshirika'}{t.phone ? ` · ${t.phone}` : ''}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  box: { borderWidth: 2, borderColor: BLUE, borderRadius: 16, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  chipOn: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontFamily: F.bold, fontSize: 14, color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.ink, fontFamily: F.regular },
  wa: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  waText: { color: '#fff', fontFamily: F.black, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
});
