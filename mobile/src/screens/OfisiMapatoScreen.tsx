import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiMapato'>;
const GREEN = '#15803d';
const R = OFFICE_RULES.partners;

interface Revenue {
  today?: number; thisWeek?: number; thisMonth?: number; total?: number;
  shippedCount?: number; completedCount?: number;
  monthly?: Array<{ month: string; orders: number; revenue: number }>;
}
interface Referrals {
  referralCode?: string | null;
  freeOrdersGranted?: number; freeOrdersUsed?: number;
  referrals?: Array<{ id: number; status: string; referredUser?: { name?: string } | null }>;
}

const money = (n: unknown) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
const monthName = (m: string) => {
  const d = new Date(`${m}-01T00:00:00`);
  return isNaN(d.getTime()) ? m : d.toLocaleDateString('sw-TZ', { year: 'numeric', month: 'long' });
};

/** Mapato (revenue) and the office's referral code, as on the web office page. Read-only. */
export default function OfisiMapatoScreen({ navigation }: P) {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [refs, setRefs] = useState<Referrals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rev, ref] = await Promise.all([
        api.get<Revenue>(R.endpoints.revenue.split(' ')[1]).catch(() => null),
        api.get<Referrals>(R.endpoints.referrals.split(' ')[1]).catch(() => null),
      ]);
      setRevenue(rev);
      setRefs(ref);
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const link = refs?.referralCode ? R.referralLink.replace('{referralCode}', refs.referralCode) : '';
  const freeLeft = Math.max(0, Number(refs?.freeOrdersGranted || 0) - Number(refs?.freeOrdersUsed || 0));

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      <Text style={type.title}>Mapato</Text>
      {!!error && <Text style={[type.meta, { color: colors.danger }]}>{error}</Text>}

      {revenue && (
        <>
          <View style={s.card}>
            <Text style={type.small}>Leo</Text>
            <Text style={s.big}>{money(revenue.today)}</Text>
            <View style={s.two}>
              <Stat label="Wiki hii" value={money(revenue.thisWeek)} />
              <Stat label="Mwezi huu" value={money(revenue.thisMonth)} />
            </View>
            <View style={s.two}>
              <Stat label="Mapato yote" value={money(revenue.total)} />
              <Stat label="Vimetumwa / Vimefikishwa" value={`${revenue.shippedCount ?? 0} / ${revenue.completedCount ?? 0}`} />
            </View>
          </View>

          {!!revenue.monthly?.length && (
            <View style={s.card}>
              <Text style={type.name}>Mapato kwa mwezi</Text>
              {revenue.monthly.map((m) => (
                <View key={m.month} style={s.row}>
                  <Text style={type.small}>{monthName(m.month)} ({m.orders} {m.orders === 1 ? 'agizo' : 'maagizo'})</Text>
                  <Text style={[type.small, { fontFamily: F.bold, color: colors.ink }]}>{money(m.revenue)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {refs && (
        <View style={s.card}>
          <Text style={type.name}>Wape wenzako wajiunge</Text>
          <Text style={[type.name, { color: BLUE_TXT }]}>{refs.referralCode || '—'}</Text>
          {!!link && (
            <Pressable onPress={() => Share.share({ message: link })} accessibilityRole="button" style={s.btn}>
              <Text style={s.btnText}>Shiriki kiungo</Text>
            </Pressable>
          )}
          <View style={s.row}>
            <Text style={type.small}>Oda za bure zilizobaki</Text>
            <Text style={[type.name, { color: GREEN }]}>{freeLeft}</Text>
          </View>
          {(refs.referrals || []).map((r) => {
            const [text, color] = (R.referralStatusLabels as Record<string, readonly [string, string]>)[r.status] || [r.status, colors.muted];
            return (
              <View key={r.id} style={s.row}>
                <Text style={type.small}>{r.referredUser?.name || '—'}</Text>
                <Text style={[type.small, { color, fontFamily: F.bold }]}>{text}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button"><Text style={[type.name, { textAlign: 'center' }]}>Rudi</Text></Pressable>
    </ScrollView>
  );
}

const BLUE_TXT = '#1d4ed8';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.name, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 8 },
  big: { fontFamily: F.black, fontSize: 28, color: colors.ink },
  two: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  btn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
});
