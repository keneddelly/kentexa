import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { tokens } from '../api/tokens';
import { API_URL, WEB_URL } from '../config';
import { Button, Empty } from '../components/Ui';
import { useAuth } from '../auth/AuthContext';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams>;

/** Ofisi green (the KenteXa Ofisi app). */
const GREEN = '#15803d';

interface Parcel {
  trackingNumber: string;
  customerNumber?: string;
  status: string;
  myRole?: 'origin' | 'destination' | 'both';
}

/** One row of GET /pickup-tasks/hub/expected. The server sets nextAction; the app only shows it. */
interface Expected {
  trackingNumber: string;
  waybill?: string | null;
  orderId?: number | null;
  nextAction: string;
  pickupTask?: { id: number; agentName?: string | null } | null;
  sender?: { name?: string | null } | null;
}

interface Dashboard {
  status?: string;
  activeRoleRequired?: boolean;
  agent?: { businessName?: string; city?: string; billing?: { billingBlocked?: boolean } };
  parcels?: Parcel[];
}

/**
 * Puts the phone on this account's office role, the same switch the website makes, so the office
 * data is read in the office's own context. 'none': no office on this account. 'pending': an office
 * exists but is not switchable yet.
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
    // Sent directly, not through the shared client: a failed switch shows its own message here
    // and does not sign the person out of the app.
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

/** Groups come from shared/office-rules.json (same rules as the web office page). */
function inGroup(p: Parcel, statuses: readonly string[], role: 'destination' | 'not_destination' | 'not_origin'): boolean {
  if (!statuses.includes(p.status)) return false;
  if (role === 'destination') return p.myRole === 'destination';
  if (role === 'not_destination') return p.myRole !== 'destination';
  return p.myRole !== 'origin';
}

const G = OFFICE_RULES.groups;
const label = (status: string) => (OFFICE_RULES.statusLabels as Record<string, string>)[status] || 'Inaendelea';

export default function OfisiScreen({ navigation }: P) {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [expected, setExpected] = useState<Expected[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [group, setGroup] = useState<'pokea' | 'tuma'>('pokea');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const office = await ensureOfficeContext();
      if (office === 'none') { setData({ status: 'not_applied' }); return; }
      if (office === 'pending') { setData({ status: 'active_role_required', activeRoleRequired: true }); return; }
      const [dash, exp] = await Promise.all([
        api.get<Dashboard>('/super-agents/dashboard'),
        // Same list the web POKEA tab reads. If it fails, POKEA still shows the parcels it has.
        api.get<Expected[]>('/pickup-tasks/hub/expected').catch(() => [] as Expected[]),
      ]);
      setData(dash);
      setExpected(Array.isArray(exp) ? exp : []);
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia. Jaribu tena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const openWeb = (path: string, title: string) => navigation.navigate('Web', { url: `${WEB_URL}${path}`, title });

  /** Same calls as the web expected list, chosen by the server's nextAction. */
  const receiveExpected = (row: Expected) => {
    const name = row.orderId ? `Oda #${row.orderId}` : (row.waybill || row.trackingNumber);
    const q = encodeURIComponent(row.trackingNumber);
    const run = async () => {
      if (row.nextAction === 'receive_order' && row.orderId) return api.patch(`/orders/${row.orderId}/super-agent-receive`, {});
      if (row.nextAction === 'confirm_agent_handover' && row.pickupTask?.id) return api.post(`/pickup-tasks/${row.pickupTask.id}/hub-receive`);
      if (row.nextAction === 'receive_from_sender') return api.patch(`/super-agents/parcels/${q}/status`, { status: 'received_at_hub' });
      throw new Error('Hatua hii haipo kwenye app. Tumia kivinjari.');
    };
    Alert.alert('Pokea mzigo?', `${name} umepokelewa ofisini kwako.`, [
      { text: 'Hapana', style: 'cancel' },
      { text: 'Ndiyo', onPress: () => doAction(row.trackingNumber, name, run) },
    ]);
  };

  /** Incoming parcel that has reached this office. Same call the web arrival row makes. */
  const confirmArrived = (p: Parcel) => {
    const name = p.customerNumber || p.trackingNumber;
    Alert.alert('Mzigo umefika?', `${name} umefika ofisini kwako.`, [
      { text: 'Hapana', style: 'cancel' },
      {
        text: 'Ndiyo',
        onPress: () => doAction(p.trackingNumber, name, () =>
          api.patch(`/super-agents/shipments/${encodeURIComponent(p.trackingNumber)}/arrived`, { city: data?.agent?.city })),
      },
    ]);
  };

  const doAction = async (key: string, name: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setNotice('');
    try {
      await run();
      setNotice(`${name}: imethibitishwa.`);
      await load();
    } catch (e: any) {
      setNotice(e?.message || 'Imeshindikana. Jaribu tena.');
    } finally {
      setBusy('');
    }
  };

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
  const incoming = parcels.filter((p) => inGroup(p, G.pokea.incoming.statuses, 'destination'));
  const toDispatch = parcels.filter((p) => inGroup(p, G.tuma.toDispatch.statuses, 'not_destination'));
  const inTransit = parcels.filter((p) => inGroup(p, G.tuma.inTransit.statuses, 'not_destination'));
  const awaitingBuyer = parcels.filter((p) => inGroup(p, G.tuma.awaitingBuyer.statuses, 'not_origin'));

  // Same counts as the web: POKEA = incoming + expected arrivals; TUMA = to dispatch + awaiting buyer.
  const pokeaCount = incoming.length + expected.length;
  const tumaCount = toDispatch.length + awaitingBuyer.length;

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      {header}

      {data.agent?.billing?.billingBlocked && (
        <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.banner} accessibilityRole="button">
          <Text style={[type.name, { color: colors.danger }]}>Malipo yanahitajika</Text>
          <Text style={type.meta}>Lipa ada ili kuendelea kupokea mizigo. Gusa kufungua.</Text>
        </Pressable>
      )}

      <View style={s.jobs}>
        <JobCard word="POKEA" line="Mzigo unaingia ofisini" count={pokeaCount} color="#1d4ed8" active={group === 'pokea'} onPress={() => setGroup('pokea')} />
        <JobCard word="TUMA" line="Mzigo unatoka ofisini" count={tumaCount} color="#c97a30" active={group === 'tuma'} onPress={() => setGroup('tuma')} />
      </View>

      <Pressable onPress={() => navigation.navigate('OfisiSettings')} style={s.quick} accessibilityRole="button">
        <Text style={type.name}>Mipangilio ya ofisi</Text>
        <Text style={type.small}>Jina, mji na hali</Text>
      </Pressable>

      {!!notice && <Text style={[type.meta, s.notice]}>{notice}</Text>}

      {group === 'pokea' ? (
        <>
          <Text style={[type.name, s.section]}>Mizigo ya kupokea</Text>
          {expected.map((row) => {
            const name = row.orderId ? `Oda #${row.orderId}` : (row.waybill || row.trackingNumber);
            const working = busy === row.trackingNumber;
            const act = OFFICE_RULES.expectedActions[row.nextAction as keyof typeof OFFICE_RULES.expectedActions];
            const canAct = row.nextAction !== 'agent_on_the_way' && !!act?.label;
            return (
              <View key={`e-${row.trackingNumber}`} style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.name}>{name}</Text>
                  <Text style={type.small}>
                    {row.nextAction === 'agent_on_the_way' ? 'Wakala yuko njiani'
                      : row.nextAction === 'confirm_agent_handover' ? `Thibitisha kutoka kwa ${row.pickupTask?.agentName || 'wakala'}`
                      : (row.sender?.name || 'Inasubiri kupokelewa')}
                  </Text>
                </View>
                {canAct && (
                  <Pressable onPress={() => receiveExpected(row)} disabled={!!busy} accessibilityRole="button"
                    style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }, !!busy && { opacity: 0.5 }]}>
                    <Text style={s.actionText}>{working ? '…' : 'Pokea'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {incoming.map((p) => {
            const working = busy === p.trackingNumber;
            const canArrive = p.status === 'dispatched' || p.status === 'in_transit';
            return (
              <View key={`i-${p.trackingNumber}`} style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                  <Text style={type.small}>{label(p.status)}</Text>
                </View>
                {canArrive && (
                  <Pressable onPress={() => confirmArrived(p)} disabled={!!busy} accessibilityRole="button"
                    style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }, !!busy && { opacity: 0.5 }]}>
                    <Text style={s.actionText}>{working ? '…' : 'Imefika'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {expected.length === 0 && incoming.length === 0 && <Text style={type.meta}>Hakuna mzigo unaosubiri kupokelewa sasa hivi.</Text>}
          {/* Walk-in and the handover list stay on the web page for now (same as the web's own tab). */}
          <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.walkin} accessibilityRole="button">
            <Text style={type.name}>Walk-in</Text>
            <Text style={type.small}>Mteja amekuja ofisini. Fungua fomu kwenye kivinjari.</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[type.name, s.section]}>Mizigo ya kutuma</Text>
          {toDispatch.map((p) => (
            <View key={`t-${p.trackingNumber}`} style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                <Text style={type.small}>{label(p.status)}</Text>
              </View>
            </View>
          ))}
          {inTransit.map((p) => (
            <View key={`n-${p.trackingNumber}`} style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                <Text style={type.small}>{label(p.status)}</Text>
              </View>
            </View>
          ))}
          {awaitingBuyer.map((p) => (
            <View key={`b-${p.trackingNumber}`} style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                <Text style={type.small}>{label(p.status)}</Text>
              </View>
            </View>
          ))}
          {tumaCount === 0 && inTransit.length === 0 && <Text style={type.meta}>Hakuna mzigo wa kutuma sasa hivi.</Text>}
          {/* Sending (transport and fare) stays on the web page: it needs the full dispatch form. */}
          <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.walkin} accessibilityRole="button">
            <Text style={type.name}>Tuma mzigo</Text>
            <Text style={type.small}>Chagua usafiri na bei kwenye kivinjari.</Text>
          </Pressable>
        </>
      )}
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
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  head: { gap: 2, marginBottom: 4 },
  brand: { fontFamily: F.black, fontSize: 22, color: colors.ink, letterSpacing: -0.3 },
  err: { color: colors.danger },
  banner: { borderRadius: 12, borderWidth: 1, borderColor: colors.danger, padding: 12, gap: 2 },
  jobs: { flexDirection: 'row', gap: 10 },
  job: { flex: 1, borderRadius: 16, padding: 16, minHeight: 150, justifyContent: 'space-between' },
  jobIdle: { opacity: 0.55 },
  jobWord: { fontFamily: F.black, fontSize: 26, color: '#fff', letterSpacing: -0.3 },
  jobLine: { fontFamily: F.regular, fontSize: 13, color: '#fff' },
  jobCount: { fontFamily: F.black, fontSize: 30, color: '#fff' },
  quick: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 2 },
  walkin: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 2, marginTop: 8 },
  section: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  actionBtn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minWidth: 84, alignItems: 'center' },
  actionText: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
  notice: { color: GREEN },
});
