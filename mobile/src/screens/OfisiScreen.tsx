import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button, Empty } from '../components/Ui';
import { useAuth } from '../auth/AuthContext';
import { WEB_URL } from '../config';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;

/** Ofisi green (the KenteXa Ofisi app, owner 2026-11-03). */
const GREEN = '#15803d';

interface Parcel {
  trackingNumber: string;
  customerNumber?: string;
  status: string;
  myRole?: 'origin' | 'destination' | 'both';
}

interface Dashboard {
  status?: string;
  activeRoleRequired?: boolean;
  agent?: { businessName?: string; city?: string; billing?: { billingBlocked?: boolean } };
  stats?: { pending: number; receivedAtHub: number; inTransit: number; arrivedAtHub: number; delivered: number };
  parcels?: Parcel[];
}

/** Plain Swahili for a parcel's state. Unknown states show as "Inaendelea". */
const STATUS_SW: Record<string, string> = {
  pending: 'Inasubiri',
  received_at_hub: 'Imepokelewa ofisini',
  verified: 'Imethibitishwa',
  ready_for_dispatch: 'Tayari kutumwa',
  dispatched: 'Njiani',
  in_transit: 'Njiani',
  arrived_at_hub: 'Imefika ofisini',
  delivered: 'Imewasilishwa',
};

/**
 * KenteXa Ofisi, home (MVP). Reads the office's own dashboard (GET /super-agents/dashboard) and shows
 * its parcels. Taking an action on a parcel (receive, dispatch, hand over) opens the office page on
 * kentexa.com, where the full, tested flow already lives. Nothing here changes a parcel by itself.
 */
export default function OfisiScreen({ navigation }: P) {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  /**
   * What the office can do right here, per parcel. Same calls the web office page makes:
   * - pending parcel from a sender: "Pokea" (received at this office);
   * - parcel on its way to this office: "Imefika" (arrived here).
   * Sending (dispatch) needs the transport and fare form, so it stays on the web page.
   */
  const actionFor = (p: Parcel): 'receive' | 'arrived' | null => {
    if (p.status === 'pending' && p.myRole !== 'destination') return 'receive';
    if ((p.status === 'dispatched' || p.status === 'in_transit') && p.myRole === 'destination') return 'arrived';
    return null;
  };

  const runAction = (p: Parcel, kind: 'receive' | 'arrived') => {
    const city = data?.agent?.city;
    const label = p.customerNumber || p.trackingNumber;
    const q = encodeURIComponent(p.trackingNumber);
    const title = kind === 'receive' ? 'Pokea mzigo?' : 'Mzigo umefika?';
    const body = kind === 'receive' ? `${label} umepokelewa ofisini kwako.` : `${label} umefika ofisini kwako.`;
    Alert.alert(title, body, [
      { text: 'Hapana', style: 'cancel' },
      {
        text: 'Ndiyo',
        onPress: async () => {
          setBusy(p.trackingNumber);
          setNotice('');
          try {
            if (kind === 'receive') await api.patch(`/super-agents/parcels/${q}/status`, { status: 'received_at_hub', city });
            else await api.patch(`/super-agents/shipments/${q}/arrived`, { city });
            setNotice(`${label}: imethibitishwa.`);
            await load();
          } catch (e: any) {
            setNotice(e?.message || 'Imeshindikana. Jaribu tena.');
          } finally {
            setBusy('');
          }
        },
      },
    ]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<Dashboard>('/super-agents/dashboard'));
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia. Jaribu tena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const openWeb = (path: string, title: string) => navigation.navigate('Web', { url: `${WEB_URL}${path}`, title });

  if (!user) {
    return <Empty title="KenteXa Ofisi" text="Ingia kuona ofisi yako." action={<Button title="Ingia" onPress={() => navigation.navigate('Login')} />} />;
  }

  const header = (
    <View style={s.head}>
      <Text style={s.brand}>KenteXa <Text style={{ color: GREEN }}>Ofisi</Text></Text>
      {!!data?.agent?.businessName && <Text style={type.meta}>{data.agent.businessName}{data.agent.city ? ` · ${data.agent.city}` : ''}</Text>}
    </View>
  );

  if (!data && error) {
    return (
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {header}
        <Text style={[type.meta, s.err]}>{error}</Text>
        <Button title="Jaribu tena" onPress={load} />
      </ScrollView>
    );
  }
  if (!data) return <View style={s.wrap}>{header}</View>;

  if (data.status === 'not_applied') {
    return (
      <View style={s.wrap}>
        {header}
        <Empty title="Huna ofisi bado" text="Omba kuwa ofisi kwenye KenteXa, kisha utaona mizigo yako hapa." action={<Button title="Omba ofisi" dark={false} onPress={() => openWeb('/p/BecomeSuperAgentInfo', 'Omba ofisi')} />} />
      </View>
    );
  }
  if (data.activeRoleRequired) {
    return (
      <View style={s.wrap}>
        {header}
        <Empty title="Ofisi haijawashwa" text="Ombi lako bado halijakubaliwa, au wasifu wa ofisi haujawashwa. Angalia kwenye KenteXa." action={<Button title="Fungua ofisi" dark={false} onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} />} />
      </View>
    );
  }

  const st = data.stats;
  const parcels = data.parcels || [];

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      {header}

      {data.agent?.billing?.billingBlocked && (
        <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.banner} accessibilityRole="button">
          <Text style={[type.name, { color: colors.danger }]}>Malipo yanahitajika</Text>
          <Text style={type.meta}>Lipa ada ili kuendelea kupokea mizigo. Gusa kufungua.</Text>
        </Pressable>
      )}

      <View style={s.tiles}>
        <Tile label="Zinasubiri" value={st?.pending ?? 0} />
        <Tile label="Zimepokelewa" value={st?.receivedAtHub ?? 0} />
        <Tile label="Njiani" value={st?.inTransit ?? 0} />
        <Tile label="Zimefika" value={st?.arrivedAtHub ?? 0} />
      </View>

      <Text style={[type.name, s.section]}>Mizigo</Text>
      {parcels.length === 0 && <Text style={type.meta}>Hakuna mzigo bado.</Text>}
      {!!notice && <Text style={[type.meta, s.notice]}>{notice}</Text>}
      {parcels.map((p) => {
        const act = actionFor(p);
        const working = busy === p.trackingNumber;
        return (
          <View key={p.trackingNumber} style={s.row}>
            <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={{ flex: 1 }} accessibilityRole="button">
              <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
              <Text style={type.small}>{STATUS_SW[p.status] || 'Inaendelea'}</Text>
            </Pressable>
            {act && (
              <Pressable onPress={() => runAction(p, act)} disabled={!!busy} accessibilityRole="button"
                style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }, !!busy && { opacity: 0.5 }]}>
                <Text style={s.actionText}>{working ? '…' : act === 'receive' ? 'Pokea' : 'Imefika'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 12 },
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  head: { gap: 2, marginBottom: 4 },
  brand: { fontFamily: F.black, fontSize: 22, color: colors.ink, letterSpacing: -0.3 },
  err: { color: colors.danger },
  banner: { borderRadius: 12, borderWidth: 1, borderColor: colors.danger, padding: 12, gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: 12, backgroundColor: colors.soft, padding: 14 },
  tileValue: { fontFamily: F.black, fontSize: 24, color: colors.ink },
  tileLabel: { fontFamily: F.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  section: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  actionBtn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minWidth: 84, alignItems: 'center' },
  actionText: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
  notice: { color: GREEN },
});
