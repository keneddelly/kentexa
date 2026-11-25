import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { tokens } from '../api/tokens';
import { API_URL } from '../config';
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

/**
 * Puts the phone on this account's office role, the same switch the website makes, so the office
 * data is read in the office's own context. 'none': no office on this account. 'pending': an office
 * exists but is not switchable yet (application not accepted).
 */
async function ensureOfficeContext(): Promise<'ok' | 'none' | 'pending'> {
  const roles: any = await api.get('/auth/roles');
  const list: any[] = Array.isArray(roles?.availableRoles) ? roles.availableRoles : [];
  const mine = list.filter((r) => r.roleType === 'super_agent');
  if (mine.length === 0) return 'none';
  const office = mine.find((r) => r.switchable);
  if (!office) return 'pending';
  const me: any = await api.get('/auth/me');
  if (Number(me?.activeContext?.accountRoleId) !== Number(office.accountRoleId)) {
    // Sent directly, not through the shared client: a failed switch must show its own message here,
    // and must not sign the person out of the app.
    const res = await fetch(`${API_URL}/auth/switch-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kentexa-client': 'app',
        ...(tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
      },
      body: JSON.stringify({ accountRoleId: Number(office.accountRoleId) }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Ofisi haikufunguka (${res.status}): ${body?.message || 'jaribu tena'}`);
    const refresh = res.headers.get('x-kentexa-refresh');
    if (refresh) await tokens.setRefresh(refresh);
    if (body?.accessToken) await tokens.setAccess(body.accessToken);
  }
  return 'ok';
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
/**
 * As on the web office page (its POKEA and TUMA):
 * POKEA: taking parcels in: walk-in senders, KenteXa orders to receive, and parcels arriving here.
 * TUMA: parcels that leave this office: waiting to go out, or on their way.
 */
const isPokea = (p: Parcel) =>
  (['pending', 'verified', 'received_at_hub'].includes(p.status) && p.myRole !== 'destination') ||
  ((p.status === 'dispatched' || p.status === 'in_transit') && p.myRole === 'destination');
const isTuma = (p: Parcel) =>
  ['ready_for_dispatch', 'dispatched', 'in_transit'].includes(p.status) && p.myRole !== 'destination';

export default function OfisiScreen({ navigation }: P) {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [group, setGroup] = useState<'pokea' | 'tuma'>('pokea');

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
      const office = await ensureOfficeContext();
      if (office === 'none') { setData({ status: 'not_applied' }); return; }
      if (office === 'pending') { setData({ status: 'active_role_required', activeRoleRequired: true }); return; }
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

  const parcels = data.parcels || [];
  const pokea = parcels.filter(isPokea);
  const tuma = parcels.filter(isTuma);
  const shown = group === 'pokea' ? pokea : tuma;

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      {header}

      {data.agent?.billing?.billingBlocked && (
        <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.banner} accessibilityRole="button">
          <Text style={[type.name, { color: colors.danger }]}>Malipo yanahitajika</Text>
          <Text style={type.meta}>Lipa ada ili kuendelea kupokea mizigo. Gusa kufungua.</Text>
        </Pressable>
      )}

      {/* The two daily jobs, big, as on the web office page. Tapping one shows its parcels below. */}
      <View style={s.jobs}>
        <JobCard word="POKEA" line="Mzigo unaingia ofisini" count={pokea.length} color="#1d4ed8" active={group === 'pokea'} onPress={() => setGroup('pokea')} />
        <JobCard word="TUMA" line="Mzigo unatoka ofisini" count={tuma.length} color="#c97a30" active={group === 'tuma'} onPress={() => setGroup('tuma')} />
      </View>

      <Pressable onPress={() => navigation.navigate('OfisiSettings')} style={s.quick} accessibilityRole="button">
        <Text style={type.name}>Mipangilio ya ofisi</Text>
        <Text style={type.small}>Jina, mji na hali</Text>
      </Pressable>

      <Text style={[type.name, s.section]}>{group === 'pokea' ? 'Mizigo ya kupokea' : 'Mizigo ya kutuma'}</Text>
      {shown.length === 0 && (
        <Text style={type.meta}>
          {group === 'pokea'
            ? 'Hakuna mzigo unaoingia ofisini sasa hivi. Mzigo ukitumwa kwenye ofisi yako utaonekana hapa.'
            : 'Hakuna mzigo wa kutuma kutoka ofisini sasa hivi.'}
        </Text>
      )}
      {!!notice && <Text style={[type.meta, s.notice]}>{notice}</Text>}
      {shown.map((p) => {
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

function JobCard({ word, line, count, color, active, onPress }: { word: string; line: string; count: number; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={[s.job, { backgroundColor: color }, !active && s.jobIdle]}>
      <Text style={s.jobWord}>{word}</Text>
      <Text style={s.jobLine}>{line}</Text>
      <Text style={s.jobCount}>{count}</Text>
    </Pressable>
  );
}


const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 12 },
  jobs: { flexDirection: 'row', gap: 10 },
  job: { flex: 1, borderRadius: 16, padding: 16, minHeight: 150, justifyContent: 'space-between' },
  jobIdle: { opacity: 0.55 },
  jobWord: { fontFamily: F.black, fontSize: 26, color: '#fff', letterSpacing: -0.3 },
  jobLine: { fontFamily: F.regular, fontSize: 13, color: '#fff' },
  jobCount: { fontFamily: F.black, fontSize: 30, color: '#fff' },
  quick: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 2 },
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
