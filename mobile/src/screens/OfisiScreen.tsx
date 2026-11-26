import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { tokens } from '../api/tokens';
import { API_URL, WEB_URL } from '../config';
import { Button, Empty } from '../components/Ui';
import { useAuth } from '../auth/AuthContext';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';
import { isIntercityPlace } from '../office/regionRules';
import OfisiShipmentPaymentsCard from './OfisiShipmentPaymentsCard';
import OfisiPointPrompt from './OfisiPointPrompt';
import { readLastWalk } from './OfisiWalkInScreen';
import { useFocusEffect } from '@react-navigation/native';

type P = NativeStackScreenProps<RootStackParams>;

const GREEN = '#15803d';
const BLUE = '#1d4ed8';
const RULES = OFFICE_RULES;

interface Parcel {
  id?: number;
  trackingNumber: string;
  waybillNumber?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  buyerPhone?: string | null;
  destinationSuperAgent?: { id?: number } | null;
  customerNumber?: string;
  orderId?: number | null;
  status: string;
  myRole?: 'origin' | 'destination' | 'both';
  originCity?: string | null;
  destinationCity?: string | null;
  transportMethod?: string | null;
  buyerRequestedDelivery?: boolean;
  localAgentId?: number | null;
  order?: { paymentMethod?: string; codRemainingBalance?: number } | null;
}

interface Expected {
  trackingNumber: string;
  waybill?: string | null;
  orderId?: number | null;
  nextAction: string;
  pickupTask?: { id: number; agentName?: string | null } | null;
  sender?: { name?: string | null } | null;
}

interface Handover {
  id: number;
  city?: string;
  parcel?: { trackingNumber?: string } | null;
  agent?: { name?: string; phone?: string } | null;
}

interface LocalAgent { id: number; fullName?: string; deliveryFee?: number | null }

interface Dashboard {
  status?: string;
  activeRoleRequired?: boolean;
  agent?: { businessName?: string; city?: string; billing?: { billingBlocked?: boolean } };
  parcels?: Parcel[];
}

/**
 * Puts the phone on this account's office role, the same switch the website makes. 'none': no office
 * on this account. 'pending': an office exists but is not switchable yet.
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
    // Sent directly: a failed switch shows its own message here and does not sign the person out.
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

/** Groups and labels from shared/office-rules.json (same as the web office page). */
function inGroup(p: Parcel, statuses: readonly string[], role: 'destination' | 'not_destination' | 'not_origin'): boolean {
  if (!statuses.includes(p.status)) return false;
  if (role === 'destination') return p.myRole === 'destination';
  if (role === 'not_destination') return p.myRole !== 'destination';
  return p.myRole !== 'origin';
}
const G = RULES.groups;
const label = (status: string) => (RULES.statusLabels as Record<string, string>)[status] || 'Inaendelea';
/** Same rule as the web's isDirectLocalParcel: same town, or a local-agent path. */
const isDirectLocal = (p: Parcel) =>
  !isIntercityPlace(p.originCity, p.destinationCity) &&
  (p.transportMethod === 'local_agent' || (!p.transportMethod && String(p.originCity || '').trim().toLowerCase() === String(p.destinationCity || '').trim().toLowerCase()));
const money = (n: unknown) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

export default function OfisiScreen({ navigation }: P) {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [expected, setExpected] = useState<Expected[]>([]);
  // A failed list load says so, instead of looking like "no parcels".
  const [listError, setListError] = useState(false);
  // Receive any parcel or order by its number: the web's one box.
  const [number, setNumber] = useState('');
  const [foundOrder, setFoundOrder] = useState<any>(null);
  // Last walk-in receipt, kept until "Mzigo mpya" (the web keeps it the same way).
  const [lastWalk, setLastWalk] = useState<any>(null);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [group, setGroup] = useState<'pokea' | 'tuma'>('pokea');

  // Status sheet
  const [statusFor, setStatusFor] = useState<Parcel | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [codAmount, setCodAmount] = useState('');
  const [handoffCode, setHandoffCode] = useState<{ trackingNumber: string; code: string } | null>(null);

  // Local agent sheet
  const [dispatchFor, setDispatchFor] = useState<Parcel | null>(null);
  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const office = await ensureOfficeContext();
      if (office === 'none') { setData({ status: 'not_applied' }); return; }
      if (office === 'pending') { setData({ status: 'active_role_required', activeRoleRequired: true }); return; }
      let failed = false;
      const [dash, exp, hov] = await Promise.all([
        api.get<Dashboard>('/super-agents/dashboard'),
        api.get<Expected[]>('/pickup-tasks/hub/expected').catch(() => { failed = true; return [] as Expected[]; }),
        api.get<Handover[]>('/collections/hub/handover-requests').catch(() => { failed = true; return [] as Handover[]; }),
      ]);
      setData(dash);
      setExpected(Array.isArray(exp) ? exp : []);
      setHandovers(Array.isArray(hov) ? hov : []);
      setListError(failed);
      setLastWalk(await readLastWalk());
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia. Jaribu tena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  // Coming back from a walk-in receipt: the last receipt may have been cleared by "Mzigo mpya".
  useFocusEffect(useCallback(() => { readLastWalk().then(setLastWalk); }, []));

  const openWeb = (path: string, title: string) => navigation.navigate('Web', { url: `${WEB_URL}${path}`, title });

  /** Runs one action, shows the result, and reloads the office. */
  const doAction = async (key: string, name: string, run: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setNotice('');
    try {
      await run();
      setNotice(done || `${name}: imethibitishwa.`);
      await load();
      return true;
    } catch (e: any) {
      setNotice(e?.message || 'Imeshindikana. Jaribu tena.');
      return false;
    } finally {
      setBusy('');
    }
  };

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

  const confirmHandover = (h: Handover) => {
    const name = h.parcel?.trackingNumber || `Collection #${h.id}`;
    Alert.alert('Mzigo umepokelewa?', `${name} umepokelewa ofisini kwako.`, [
      { text: 'Hapana', style: 'cancel' },
      { text: 'Ndiyo', onPress: () => doAction(`h${h.id}`, name, () => api.patch(`/collections/${h.id}/hub-accept`, {}), 'Mzigo umethibitishwa.') },
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

  // ── Status sheet ─────────────────────────────────────────────────────────
  const openStatus = (p: Parcel) => {
    setStatusFor(p);
    setNewStatus('');
    setStatusNote('');
    setPickupCode('');
    setCodAmount('');
    setHandoffCode(null);
  };
  const closeStatus = () => { setStatusFor(null); setNewStatus(''); setStatusNote(''); setPickupCode(''); setCodAmount(''); setHandoffCode(null); };

  const statusOptions = (p: Parcel) => {
    const pre = (RULES.statusModal.preDispatchStatuses as readonly string[]).includes(p.status);
    const origin = p.myRole !== 'destination'
      ? RULES.statusModal.originOptions.filter((o) => !o.onlyPreDispatch || pre)
      : [];
    const dest = p.myRole !== 'origin' && !pre ? RULES.statusModal.destinationOptions : [];
    return [...origin, ...dest];
  };

  const saveStatus = () => {
    if (!statusFor || !newStatus) return;
    const p = statusFor;
    doAction(p.trackingNumber, p.customerNumber || p.trackingNumber, async () => {
      await api.patch(`/super-agents/parcels/${encodeURIComponent(p.trackingNumber)}/status`, { status: newStatus, city: data?.agent?.city, note: statusNote });
      closeStatus();
    }, 'Hali imesasishwa');
  };

  const sendPickupCode = async () => {
    if (!statusFor) return;
    setBusy('code');
    try {
      await api.post(`/super-agents/parcels/${encodeURIComponent(statusFor.trackingNumber)}/pickup-code`);
      setNotice('Namba ya kuthibitisha imetumwa kwa simu ya mpokeaji');
    } catch (e: any) {
      setNotice(e?.message || 'Imeshindwa kutuma namba');
    } finally { setBusy(''); }
  };

  const confirmPickup = () => {
    if (!statusFor || !new RegExp(`^\\d{${RULES.statusModal.pickupCodeLength}}$`).test(pickupCode.trim())) return;
    const p = statusFor;
    const isCod = p.order?.paymentMethod === 'cod';
    Alert.alert('Mpokeaji amekabidhiwa?', 'Je, mpokeaji yupo hapa na ameonyesha namba ya kuthibitisha?', [
      { text: 'Hapana', style: 'cancel' },
      {
        text: 'Ndiyo',
        onPress: () => doAction(p.trackingNumber, p.customerNumber || p.trackingNumber, async () => {
          await api.post(`/super-agents/parcels/${encodeURIComponent(p.trackingNumber)}/confirm-pickup`, {
            code: pickupCode.trim(),
            ...(isCod ? { codBalanceCollected: Number(codAmount) } : {}),
          });
          closeStatus();
        }, 'Kifurushi kimekabidhiwa kwa mpokeaji'),
      },
    ]);
  };

  const issueHandoff = async () => {
    if (!statusFor) return;
    setBusy('handoff');
    try {
      const res: any = await api.post(`/super-agents/parcels/${encodeURIComponent(statusFor.trackingNumber)}/agent-handoff-code`);
      setHandoffCode({ trackingNumber: statusFor.trackingNumber, code: res?.code });
    } catch (e: any) {
      setNotice(e?.message || 'Imeshindwa kuandaa makabidhiano ya wakala');
    } finally { setBusy(''); }
  };

  // ── Local agent sheet ────────────────────────────────────────────────────
  const openDispatch = async (p: Parcel) => {
    setDispatchFor(p);
    setAgentId(null);
    try {
      const city = encodeURIComponent(data?.agent?.city || '');
      const list: any = await api.get(`/agents/nearby?region=${city}`);
      setAgents(Array.isArray(list) ? list : []);
    } catch { setAgents([]); }
  };

  const sendToAgent = () => {
    if (!dispatchFor || !agentId) return;
    const p = dispatchFor;
    doAction(p.trackingNumber, p.customerNumber || p.trackingNumber, async () => {
      await api.patch(`/super-agents/parcels/${encodeURIComponent(p.trackingNumber)}/dispatch`, {
        transportType: RULES.localDispatch.defaultTransportType,
        busCompany: '', busTicketNumber: '', busDeparture: '', courierName: '', courierTrackingRef: '', notes: '',
        driverName: '', driverPhone: '', vehicleNumber: '', departureDate: '', departureTime: '',
        expectedArrivalDate: '', expectedArrivalTime: '', destinationSuperAgentId: null,
        localAgentId: agentId,
      });
      setDispatchFor(null);
    }, 'Mzigo umetumwa kwa wakala');
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
        <Empty title="Huna ofisi bado" text="Omba kuwa ofisi kwenye KenteXa, kisha utaona mizigo yako hapa." action={<Button title="Omba ofisi" dark={false} onPress={() => navigation.navigate('OfisiApply')} />} />
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

  // Same counts as the web: POKEA = incoming + expected arrivals + handovers; TUMA = to dispatch + awaiting buyer.
  const pokeaCount = incoming.length + expected.length + handovers.length;
  const tumaCount = toDispatch.length + awaitingBuyer.length;

  const sheetParcel = statusFor;
  const canPickup = !!sheetParcel && sheetParcel.buyerRequestedDelivery !== true &&
    (RULES.statusModal.pickupOfferStatuses as readonly string[]).includes(sheetParcel.status) && sheetParcel.myRole !== 'origin';
  const canHandoff = !!sheetParcel && sheetParcel.buyerRequestedDelivery === true && !!sheetParcel.localAgentId &&
    (RULES.statusModal.pickupOfferStatuses as readonly string[]).includes(sheetParcel.status) && sheetParcel.myRole !== 'origin';

  // The web's one box, in the same order: the list first, then an order by its number, then a parcel the sender brings.
  const typed = number.trim().toUpperCase();
  const plainNo = (v?: string | null) => String(v || '').toUpperCase().replace(/[\s-]/g, '');
  const receiveTyped = async () => {
    setFoundOrder(null);
    const t = plainNo(typed);
    const row = expected.find((r) => [r.waybill, r.trackingNumber].some((n) => !!n && plainNo(n) === t)
      || (r.orderId != null && t.replace(/^KTXORD/, '') === String(r.orderId)));
    if (row) { receiveExpected(row); return; }
    setBusy(typed);
    const order = await api.get<any>(`/orders/${encodeURIComponent(typed)}/agent-lookup`).catch(() => null);
    setBusy('');
    if (order?.orderId) { setFoundOrder(order); return; }
    const ok = await doAction(typed, typed, () => api.patch(`/super-agents/parcels/${encodeURIComponent(typed)}/status`, { status: 'received_at_hub' }), `${typed} imepokewa ofisini.`);
    if (ok) setNumber('');
  };
  const receiveFound = async () => {
    const o = foundOrder;
    if (!o) return;
    const ok = await doAction(`order-${o.orderId}`, `Oda #${o.orderId}`, () => api.patch(`/orders/${o.orderId}/super-agent-receive`, {
      originCity: data?.agent?.city || undefined, destinationCity: o.destinationCity || undefined,
    }), `Oda #${o.orderId} imepokewa ofisini.`);
    if (ok) { setFoundOrder(null); setNumber(''); }
  };

  return (
    <>
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
        {header}
        <OfisiPointPrompt />

        {data.agent?.billing?.billingBlocked && (
          <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.banner} accessibilityRole="button">
            <Text style={[type.name, { color: colors.danger }]}>Malipo yanahitajika</Text>
            <Text style={type.meta}>Lipa ada ili kuendelea kupokea mizigo. Gusa kufungua.</Text>
          </Pressable>
        )}

        <View style={s.jobs}>
          <JobCard word="POKEA" line="Mzigo unaingia ofisini" count={pokeaCount} color={BLUE} active={group === 'pokea'} onPress={() => setGroup('pokea')} />
          <JobCard word="TUMA" line="Mzigo unatoka ofisini" count={tumaCount} color="#c97a30" active={group === 'tuma'} onPress={() => setGroup('tuma')} />
        </View>

        <Pressable onPress={() => navigation.navigate('OfisiSettings')} style={s.quick} accessibilityRole="button">
          <Text style={type.name}>Mipangilio ya ofisi</Text>
          <Text style={type.small}>Jina, mji na hali</Text>
        </Pressable>

        {!!notice && <Text style={[type.meta, s.notice]}>{notice}</Text>}

        {group === 'pokea' ? (
          <>
            <Pressable onPress={() => navigation.navigate('WalkIn', { city: data.agent?.city })} style={s.walkinBig} accessibilityRole="button">
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.walkinTitle}>Walk-in</Text>
                <Text style={s.walkinLine}>Mteja amekuja ofisini. Andika mzigo mpya.</Text>
              </View>
            </Pressable>
            {!!lastWalk && (
              <Pressable onPress={() => navigation.navigate('WalkIn', { city: data.agent?.city, receipt: lastWalk })} style={s.lastWalk} accessibilityRole="button">
                <Text style={type.small}>Risiti ya mwisho: <Text style={{ fontFamily: F.bold }}>{lastWalk.customerNumber || lastWalk.trackingNumber || ''}</Text> — Fungua</Text>
              </Pressable>
            )}

            {handovers.length > 0 && (
              <>
                <Text style={[type.name, s.section]}>Mizigo kutoka kwa wakala</Text>
                {handovers.map((h) => (
                  <View key={`h-${h.id}`} style={s.row}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={type.name}>{h.parcel?.trackingNumber || `Collection #${h.id}`}</Text>
                      <Text style={type.small}>{h.agent?.name || 'Wakala'}{h.city ? ` · ${h.city}` : ''}</Text>
                    </View>
                    <Pressable onPress={() => confirmHandover(h)} disabled={!!busy} accessibilityRole="button"
                      style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }, !!busy && { opacity: 0.5 }]}>
                      <Text style={s.actionText}>{busy === `h${h.id}` ? '…' : 'Thibitisha'}</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            <Text style={[type.name, s.section]}>Mizigo ya kupokea</Text>
            <Text style={type.small}>Andika namba ya mzigo, ya oda au ya KenteXa kupokea.</Text>
            <View style={s.numberRow}>
              <TextInput value={number} onChangeText={(v) => { setNumber(v); setFoundOrder(null); }} placeholder="Mfano KTX 4829 1037 52" placeholderTextColor={colors.muted}
                autoCapitalize="characters" style={s.numberInput} />
              <Pressable onPress={receiveTyped} disabled={!typed || busy === typed} accessibilityRole="button"
                style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }, (!typed || busy === typed) && { opacity: 0.5 }]}>
                <Text style={s.actionText}>{busy === typed ? '…' : 'Pokea'}</Text>
              </Pressable>
            </View>
            {!!foundOrder && (
              <View style={s.found}>
                <Text style={type.name}>Oda #{foundOrder.orderId}</Text>
                <Text style={type.small}>{foundOrder.productName || 'Mzigo'} → {foundOrder.destinationCity || foundOrder.deliveryAddress || ''}</Text>
                <Text style={type.small}>Muuzaji (analipa ada ya usafiri): {foundOrder.sellerName || '—'}</Text>
                <Text style={type.small}>Mpokeaji: {foundOrder.recipientName || foundOrder.buyerName || '—'}</Text>
                {!!foundOrder.isCod && <Text style={[type.small, { color: BLUE }]}>Mpokeaji analipa akipokea.</Text>}
                <Pressable onPress={receiveFound} disabled={!!busy} accessibilityRole="button" style={[s.actionBtn, { alignSelf: 'flex-start', marginTop: 4 }]}>
                  <Text style={s.actionText}>{busy === `order-${foundOrder.orderId}` ? '…' : 'Pokea oda hii'}</Text>
                </Pressable>
              </View>
            )}
            {listError && <Text style={[type.meta, { color: colors.danger }]}>Mizigo haikupakia. Vuta chini ujaribu tena.</Text>}
            {expected.map((row) => {
              const name = row.orderId ? `Oda #${row.orderId}` : (row.waybill || row.trackingNumber);
              const act = RULES.expectedActions[row.nextAction as keyof typeof RULES.expectedActions];
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
                      <Text style={s.actionText}>{busy === row.trackingNumber ? '…' : 'Pokea'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {incoming.map((p) => {
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
                      <Text style={s.actionText}>{busy === p.trackingNumber ? '…' : 'Imefika'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {/* Send-form payments for parcels received here (web: after the expected list). */}
            <OfisiShipmentPaymentsCard refreshKey={incoming.length + expected.length} />
            {!listError && expected.length === 0 && incoming.length === 0 && handovers.length === 0 && <Text style={type.meta}>Hakuna mzigo unaosubiri kupokelewa sasa hivi.</Text>}
          </>
        ) : (
          <>
            <Text style={[type.name, s.section]}>Mizigo ya kutuma</Text>
            {toDispatch.map((p) => {
              const local = isDirectLocal(p);
              const van = p.transportMethod === 'van';
              return (
                <View key={`t-${p.trackingNumber}`} style={s.row}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                    <Text style={type.small}>{label(p.status)}{p.destinationCity ? ` · ${p.destinationCity}` : ''}</Text>
                  </View>
                  {local && (
                    <Pressable onPress={() => openDispatch(p)} disabled={!!busy} accessibilityRole="button" style={s.actionBtn}>
                      <Text style={s.actionText}>Chagua Agent</Text>
                    </Pressable>
                  )}
                  {!local && (
                    <Pressable disabled={!p.id && !van} onPress={() => (van
                        ? navigation.navigate('OfisiVan')
                        : navigation.navigate('OfisiShehenaNew', { single: {
                          parcelId: Number(p.id), trackingNumber: p.trackingNumber, number: p.customerNumber || p.trackingNumber,
                          destinationCity: p.destinationCity || '', waybill: p.waybillNumber || null,
                          recipientName: p.recipientName || null, recipientPhone: p.recipientPhone || null,
                          buyerPhone: p.buyerPhone || null, preferredHubId: p.destinationSuperAgent?.id ?? null } }))}
                      accessibilityRole="button" style={s.actionBtn}>
                      <Text style={s.actionText}>{van ? 'Van Desk' : 'Tuma'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {inTransit.map((p) => (
              <View key={`n-${p.trackingNumber}`} style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                  <Text style={type.small}>{label(p.status)}</Text>
                </View>
                <Pressable onPress={() => openStatus(p)} accessibilityRole="button" style={s.ghostBtn}>
                  <Text style={s.ghostText}>Sasisha</Text>
                </Pressable>
              </View>
            ))}
            {awaitingBuyer.map((p) => (
              <View key={`b-${p.trackingNumber}`} style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.name}>{p.customerNumber || p.trackingNumber}</Text>
                  <Text style={type.small}>{label(p.status)}</Text>
                </View>
                <Pressable onPress={() => openStatus(p)} accessibilityRole="button" style={s.ghostBtn}>
                  <Text style={s.ghostText}>Sasisha Hali</Text>
                </Pressable>
              </View>
            ))}
            {tumaCount === 0 && inTransit.length === 0 && <Text style={type.meta}>Hakuna mzigo wa kutuma sasa hivi.</Text>}
            <Pressable onPress={() => openWeb('/p/SuperAgentDashboard', 'Ofisi')} style={s.walkin} accessibilityRole="button">
              <Text style={type.name}>Shehena na Van</Text>
              <Text style={type.small}>Mizigo mingi ya mji mmoja, na Kentexa Van. Fungua kwenye kivinjari.</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Status sheet: same options and rules as the web status modal. */}
      <Modal visible={!!sheetParcel} transparent animationType="slide" onRequestClose={closeStatus}>
        <View style={s.scrim}>
          <ScrollView style={s.sheet} contentContainerStyle={{ gap: 10, padding: 20 }}>
            <Text style={type.name}>Sasisha Hali</Text>
            <Text style={[type.small, { color: BLUE, fontFamily: F.bold }]}>{sheetParcel?.customerNumber || sheetParcel?.trackingNumber}</Text>

            {canPickup && (
              <View style={s.box}>
                <Text style={type.name}>Mpokeaji anaweza kuchukua hapa kwa namba ya SMS</Text>
                <Button title="Tuma namba kwa mpokeaji" dark={false} onPress={sendPickupCode} />
                <TextInput value={pickupCode} onChangeText={(v) => setPickupCode(v.replace(/\D/g, '').slice(0, RULES.statusModal.pickupCodeLength))}
                  keyboardType="number-pad" placeholder="Namba ya tarakimu 6" style={s.input} />
                {sheetParcel?.order?.paymentMethod === 'cod' && (
                  <TextInput value={codAmount} onChangeText={setCodAmount} keyboardType="decimal-pad"
                    placeholder={`Salio la COD: ${money(sheetParcel?.order?.codRemainingBalance)}`} style={s.input} />
                )}
                <Button title="Nimekabidhi kwa mpokeaji" dark={false}
                  onPress={confirmPickup} />
              </View>
            )}

            {canHandoff && (
              <View style={s.box}>
                <Text style={type.name}>Kabidhi kifurushi kwa wakala aliyechaguliwa</Text>
                <Button title="Toa namba ya makabidhiano" dark={false} onPress={issueHandoff} />
                {!!handoffCode && handoffCode.trackingNumber === sheetParcel?.trackingNumber && (
                  <>
                    <Text style={type.meta}>Mwonyeshe wakala namba hii akiwa hapa. Inaisha baada ya dakika {RULES.statusModal.agentHandoffMinutes}.</Text>
                    <Text style={s.code}>{handoffCode.code}</Text>
                  </>
                )}
              </View>
            )}

            <Text style={type.small}>Chagua hali mpya</Text>
            <View style={s.chips}>
              {sheetParcel && statusOptions(sheetParcel).map((o) => (
                <Pressable key={o.value} onPress={() => setNewStatus(o.value)} accessibilityRole="button"
                  style={[s.chip, newStatus === o.value && s.chipOn]}>
                  <Text style={[s.chipText, newStatus === o.value && { color: '#fff' }]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={statusNote} onChangeText={setStatusNote} placeholder="Maelezo (hiari)" style={s.input} />

            <Button title={busy ? '…' : 'Hifadhi'} dark={false} onPress={newStatus && !busy ? saveStatus : () => {}} />
            <Pressable onPress={closeStatus} accessibilityRole="button"><Text style={[type.name, { textAlign: 'center' }]}>Ghairi</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Local agent sheet: same as the web 'Chagua Agent' choice. */}
      <Modal visible={!!dispatchFor} transparent animationType="slide" onRequestClose={() => setDispatchFor(null)}>
        <View style={s.scrim}>
          <ScrollView style={s.sheet} contentContainerStyle={{ gap: 10, padding: 20 }}>
            <Text style={type.name}>Chagua wakala wa mtaa</Text>
            <Text style={type.small}>Kwa uwasilishaji wa mwisho katika {dispatchFor?.destinationCity || data.agent?.city}</Text>
            {agents.length === 0 && <Text style={[type.meta, { color: '#d97706' }]}>Hakuna mawakala walioidhinishwa katika eneo hili</Text>}
            {agents.map((a) => (
              <Pressable key={a.id} onPress={() => setAgentId(a.id)} accessibilityRole="button"
                style={[s.agent, agentId === a.id && s.agentOn]}>
                <Text style={type.name}>{a.fullName}</Text>
                <Text style={type.small}>{Number(a.deliveryFee) > 0 ? money(a.deliveryFee) : 'Bei haijawekwa'}</Text>
              </Pressable>
            ))}
            <Button title={busy ? '…' : 'Tuma Sasa'} dark={false} onPress={agentId && !busy ? sendToAgent : () => {}} />
            <Pressable onPress={() => setDispatchFor(null)} accessibilityRole="button"><Text style={[type.name, { textAlign: 'center' }]}>Ghairi</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
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
  walkin: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 2 },
  walkinBig: { backgroundColor: BLUE, borderRadius: 16, minHeight: 76, padding: 16, flexDirection: 'row', alignItems: 'center' },
  walkinTitle: { fontFamily: F.black, fontSize: 22, color: '#fff' },
  walkinLine: { fontFamily: F.regular, fontSize: 14, color: '#dbeafe' },
  lastWalk: { borderRadius: 12, borderWidth: 2, borderColor: BLUE, backgroundColor: '#eff6ff', padding: 12 },
  numberRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  numberInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink },
  found: { borderWidth: 2, borderColor: BLUE, borderRadius: 12, padding: 12, gap: 4 },
  section: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  actionBtn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minWidth: 84, alignItems: 'center' },
  actionText: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
  ghostBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  ghostText: { color: colors.ink, fontFamily: F.bold, fontSize: 13 },
  webBtn: { borderWidth: 1, borderColor: BLUE, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  webText: { color: BLUE, fontFamily: F.bold, fontSize: 13 },
  notice: { color: GREEN },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, fontFamily: F.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontFamily: F.bold, fontSize: 14, color: colors.ink },
  code: { fontFamily: F.black, fontSize: 26, color: GREEN, letterSpacing: 6, textAlign: 'center' },
  agent: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 2 },
  agentOn: { borderColor: GREEN, backgroundColor: '#f0fdf4' },
});
