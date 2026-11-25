import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';
import OfisiPartnerInvite from './OfisiPartnerInvite';

type P = NativeStackScreenProps<RootStackParams, 'OfisiShehenaNew'>;

/**
 * Shehena mpya (batch): pick the destination town, who receives it there, the parcels to put in it,
 * then the transport. Add parcels to an open batch, or finish one and send it.
 * Same endpoints, receiver rules and wording as the web (SuperAgentDashboard.js).
 */
const SH = OFFICE_RULES.shehena;
const GREEN = '#16a34a';
const AMBER = '#d97706';

interface Place { displayLabel: string; regionName?: string | null; districtName?: string | null; placeRef?: { providerPlaceId?: string; providerKey?: string } | null }
interface Candidate { trackingNumber: string; customerNumber?: string | null; recipientName?: string | null; description?: string | null }
interface Hub { id: number; businessName?: string | null; address?: string | null; city?: string | null }
interface TransportOpt { id: number; name: string; relation?: string | null }
type Receiver = 'office' | 'manual' | 'customer';
type Step = 'new' | 'add' | 'dispatch';

const pathOf = (ep: string) => ep.split(' ')[1];

export default function OfisiShehenaNewScreen({ navigation, route }: P) {
  const init = route.params;
  const [step, setStep] = useState<Step>((init?.step as Step) || 'new');
  const [shipment, setShipment] = useState<{ id: number; destinationCity: string; lastMileName: string } | null>(
    init?.shipmentId ? { id: init.shipmentId, destinationCity: init.destinationCity || '', lastMileName: init.lastMileName || '' } : null);

  const [placeText, setPlaceText] = useState(init?.destinationCity || '');
  const [places, setPlaces] = useState<Place[]>([]);
  const [city, setCity] = useState(init?.destinationCity || '');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [receiver, setReceiver] = useState<Receiver | null>(null);
  const [hubId, setHubId] = useState<number | null>(null);
  const [manual, setManual] = useState({ name: '', phone: '', address: '' });
  const [transports, setTransports] = useState<TransportOpt[]>([]);
  const [transport, setTransport] = useState<{ transportProviderId: number | null; transportCompany: string; transportRef: string; totalShippingCost: string }>(
    { transportProviderId: null, transportCompany: '', transportRef: '', totalShippingCost: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A parcel sent as a shehena of one is always the chosen parcel (web: inviteParcel).
  const single = init?.single;
  const chosen = single ? [single.trackingNumber] : candidates.filter((c) => selected[c.trackingNumber]).map((c) => c.trackingNumber);

  // Destination search (same place engine as the web picker).
  useEffect(() => {
    const q = placeText.trim();
    if (step !== 'new' || single || q.length < 2 || q === city) { setPlaces([]); return; }
    const t = setTimeout(async () => {
      try {
        const r: any = await api.get(`/location-intelligence/places?q=${encodeURIComponent(q)}&limit=8`);
        setPlaces(Array.isArray(r?.candidates) ? r.candidates : []);
      } catch { setPlaces([]); }
    }, 220);
    return () => clearTimeout(t);
  }, [placeText, city, step, single]);

  const loadCandidates = async (c: string) => {
    if (!c) { setCandidates([]); return; }
    try {
      const r = await api.get<Candidate[]>(`${pathOf(SH.endpoints.candidates)}=${encodeURIComponent(c)}`);
      setCandidates(Array.isArray(r) ? r : []);
    } catch { setCandidates([]); }
  };

  const loadHubs = async (c: string) => {
    if (!c) { setHubs([]); return; }
    try {
      const r = await api.get<Hub[]>(pathOf(SH.endpoints.hubs).replace(':city', encodeURIComponent(c)));
      setHubs(Array.isArray(r) ? r : []);
    } catch { setHubs([]); }
  };

  // Opened from an open batch: load its parcels, or the transport list for dispatch.
  useEffect(() => {
    if (init?.step === 'add' && init.destinationCity) loadCandidates(init.destinationCity);
    if (init?.step === 'dispatch') loadTransports();
    if (init?.destinationCity) setCity(init.destinationCity);
    if (init?.single) { setCity(init.single.destinationCity); loadHubs(init.single.destinationCity); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTransports = async () => {
    try {
      const r: any = await api.get(pathOf(SH.endpoints.transportList));
      setTransports(Array.isArray(r?.transport) ? r.transport : []);
    } catch { setTransports([]); }
  };

  const pickPlace = (p: Place) => {
    const c = p.regionName || p.districtName || '';
    setPlaces([]);
    setPlaceText(p.displayLabel);
    setCity(c);
    setReceiver(null);
    setHubId(null);
    setSelected({});
    loadCandidates(c);
    loadHubs(c);
  };

  const receiverReady = receiver === 'office' ? hubId != null
    : (receiver === 'manual' || receiver === 'customer') ? manual.name.trim().length > 0 && manual.phone.trim().length > 0 : false;

  const chooseCustomer = () => {
    if (!single) return;
    setReceiver('customer');
    setManual({ name: single.recipientName || '', phone: single.buyerPhone || single.recipientPhone || '', address: '' });
  };

  const toggle = (tn: string) => setSelected((s) => ({ ...s, [tn]: !s[tn] }));

  const createBatch = async () => {
    if (!chosen.length) return;
    if (!receiverReady) { setError(SH.messages.chooseReceiver); return; }
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { destinationCity: city, trackingNumbers: chosen };
      if (receiver === 'office') body.destinationSuperAgentId = hubId;
      else { body.manualContactName = manual.name; body.manualContactPhone = manual.phone; body.manualContactCity = city; body.manualContactAddress = manual.address; }
      const r: any = await api.post(pathOf(SH.endpoints.create), body);
      if (single) {
        // Same as the web: a parcel sent as a shehena of one goes straight on to the transport.
        const hub = hubs.find((h) => h.id === hubId);
        setShipment({ id: r.shipmentId, destinationCity: city, lastMileName: hub?.businessName || manual.name });
        setStep('dispatch');
        loadTransports();
        return;
      }
      // Same as the web: a new batch waits in the open list until it is finished with "Maliza na Tuma".
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message || SH.messages.createFailed);
    } finally {
      setBusy(false);
    }
  };

  const addParcels = async () => {
    if (!shipment || !chosen.length) return;
    setBusy(true);
    setError('');
    try {
      await api.post(pathOf(SH.endpoints.addParcels).replace(':id', String(shipment.id)), { trackingNumbers: chosen });
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message || SH.messages.addFailed);
    } finally {
      setBusy(false);
    }
  };

  const dispatch = async () => {
    if (!shipment) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(pathOf(SH.endpoints.dispatch).replace(':id', String(shipment.id)), {
        transportCompany: transport.transportCompany || undefined,
        transportProviderId: transport.transportProviderId || undefined,
        transportRef: transport.transportRef || undefined,
        totalShippingCost: Number(transport.totalShippingCost) || undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message || SH.messages.dispatchFailed);
    } finally {
      setBusy(false);
    }
  };

  const typed = transport.transportProviderId == null;

  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      {step === 'new' && single && (
        <Text style={[type.name, s.head]}>Mzigo mmoja · {single.number} → {single.destinationCity}</Text>
      )}

      {step === 'new' && !single && (
        <>
          <Text style={type.small}>Mji wa kuelekea</Text>
          <TextInput value={placeText} onChangeText={(v) => { setPlaceText(v); setCity(''); }} placeholder="Tafuta eneo la shehena…"
            placeholderTextColor={colors.muted} style={s.input} />
          {places.map((p, i) => (
            <Pressable key={`${p.placeRef?.providerPlaceId || i}`} onPress={() => pickPlace(p)} accessibilityRole="button" style={s.row1}>
              <Text style={type.name}>{p.displayLabel}</Text>
            </Pressable>
          ))}

          {!!city && (
            <>
              <Text style={[type.name, s.head]}>{SH.labels.receiverQuestion.replace('{city}', city)}</Text>
              <Choice on={receiver === 'office'} title={SH.receiverModes.office}
                sub={hubs.length ? `Ofisi ${hubs.length} ziko ${city}` : `Hakuna ofisi ya KenteXa ${city} bado`}
                onPress={() => { setReceiver('office'); setHubId(null); }} />
              {receiver === 'office' && hubs.map((h) => (
                <Pressable key={h.id} onPress={() => setHubId(h.id)} accessibilityRole="radio" accessibilityState={{ selected: hubId === h.id }}
                  style={[s.hub, hubId === h.id && s.on]}>
                  <Text style={type.name}>{h.businessName}</Text>
                  <Text style={type.meta}>{h.address || h.city}</Text>
                </Pressable>
              ))}
              <Choice on={receiver === 'manual'} title={SH.receiverModes.manual} sub="Andika jina, simu na mahali"
                onPress={() => setReceiver('manual')} />
              {single && (
                <Choice on={receiver === 'customer'} title={SH.single.receiverCustomer.title} sub={SH.single.receiverCustomer.sub}
                  onPress={chooseCustomer} />
              )}
              {(receiver === 'manual' || receiver === 'customer') && (
                <View style={{ gap: 8 }}>
                  <TextInput value={manual.name} onChangeText={(v) => setManual({ ...manual, name: v })} placeholder="Jina la ofisi au mtu" placeholderTextColor={colors.muted} style={s.input} />
                  <TextInput value={manual.phone} onChangeText={(v) => setManual({ ...manual, phone: v })} keyboardType="phone-pad" placeholder="Namba ya simu" placeholderTextColor={colors.muted} style={s.input} />
                  <TextInput value={manual.address} onChangeText={(v) => setManual({ ...manual, address: v })} placeholder="Mahali (mf. Stendi kuu, Ofisi 23)" placeholderTextColor={colors.muted} style={s.input} />
                </View>
              )}
            </>
          )}
        </>
      )}

      {(step === 'new' || step === 'add') && candidates.length > 0 && (
        <>
          <Text style={[type.name, s.head]}>Chagua vifurushi ({chosen.length}/{candidates.length})</Text>
          {candidates.map((c) => (
            <Pressable key={c.trackingNumber} onPress={() => toggle(c.trackingNumber)} accessibilityRole="checkbox"
              accessibilityState={{ checked: !!selected[c.trackingNumber] }} style={[s.row1, selected[c.trackingNumber] && s.on]}>
              <Text style={[type.name, { fontFamily: 'monospace' }]}>{c.customerNumber || c.trackingNumber}</Text>
              <Text style={type.meta}>{c.recipientName} — {c.description || 'Bidhaa'}</Text>
            </Pressable>
          ))}
        </>
      )}
      {(step === 'new' || step === 'add') && !single && !!city && candidates.length === 0 && (
        <Text style={s.empty}>{SH.messages.noParcels}</Text>
      )}

      {step === 'new' && (
        <Pressable onPress={createBatch} disabled={busy || !chosen.length || !receiverReady} accessibilityRole="button"
          style={[s.btn, { backgroundColor: AMBER }, (busy || !chosen.length || !receiverReady) && { opacity: 0.5 }]}>
          <Text style={s.btnText}>{busy ? '…' : single ? SH.single.continueLabel : SH.labels.createAction.replace('{n}', String(chosen.length))}</Text>
        </Pressable>
      )}

      {step === 'add' && shipment && (
        <>
          <Text style={type.meta}>Kuongeza kwenye shehena → {shipment.destinationCity}{shipment.lastMileName ? ` (${shipment.lastMileName})` : ''}</Text>
          <Pressable onPress={addParcels} disabled={busy || !chosen.length} accessibilityRole="button"
            style={[s.btn, { backgroundColor: AMBER }, (busy || !chosen.length) && { opacity: 0.5 }]}>
            <Text style={s.btnText}>{busy ? '…' : SH.labels.addAction.replace('{n}', String(chosen.length))}</Text>
          </Pressable>
        </>
      )}

      {step === 'dispatch' && shipment && (
        <>
          <Text style={type.meta}>
            {single
              ? `Mzigo mmoja (${single.number}) → ${shipment.destinationCity}${shipment.lastMileName ? ` (${shipment.lastMileName})` : ''}. ${SH.single.dispatchHint}`
              : `Shehena → ${shipment.destinationCity}${shipment.lastMileName ? ` (${shipment.lastMileName})` : ''}. Taarifa za usafiri ni hiari. Ujumbe mmoja unatumwa kwa atakayepokea.`}
          </Text>
          <Text style={[type.small, s.head]}>Usafiri</Text>
          <View style={s.chips}>
            {transports.map((t) => (
              <Pressable key={t.id} onPress={() => setTransport((x) => ({ ...x, transportProviderId: t.id, transportCompany: t.name }))}
                accessibilityRole="radio" accessibilityState={{ selected: transport.transportProviderId === t.id }} style={[s.chip, transport.transportProviderId === t.id && s.on]}>
                <Text style={type.name}>{t.name}</Text>
                <Text style={type.meta}>{t.relation === 'own' ? 'Usafiri wako' : 'Mshirika'}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setTransport((x) => ({ ...x, transportProviderId: null, transportCompany: '' }))}
              accessibilityRole="radio" accessibilityState={{ selected: typed }} style={[s.chip, typed && s.on]}>
              <Text style={type.name}>{SH.defaultTransportType}</Text>
              <Text style={type.meta}>Andika jina</Text>
            </Pressable>
          </View>
          {typed && (
            <TextInput value={transport.transportCompany} onChangeText={(v) => setTransport((x) => ({ ...x, transportProviderId: null, transportCompany: v }))}
              placeholder="Kampuni ya usafiri (hiari — e.g. Shabiby Bus)" placeholderTextColor={colors.muted} style={s.input} />
          )}
          <TextInput value={transport.transportRef} onChangeText={(v) => setTransport((x) => ({ ...x, transportRef: v }))}
            placeholder="Namba ya Tiketi/Rejea (hiari)" placeholderTextColor={colors.muted} style={s.input} />
          <TextInput value={transport.totalShippingCost} onChangeText={(v) => setTransport((x) => ({ ...x, totalShippingCost: v.replace(/[^0-9]/g, '') }))}
            keyboardType="number-pad" placeholder="Gharama ya Usafiri (TZS, hiari)" placeholderTextColor={colors.muted} style={s.input} />
          {single && single.waybill ? (
            <OfisiPartnerInvite parcelId={single.parcelId} waybill={single.waybill} />
          ) : null}
          <Pressable onPress={dispatch} disabled={busy} accessibilityRole="button" style={[s.btn, { backgroundColor: GREEN }, busy && { opacity: 0.5 }]}>
            <Text style={s.btnText}>{busy ? 'Inatuma…' : single ? SH.single.dispatchLabel : SH.labels.send}</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={[type.meta, { color: '#b91c1c' }]}>{error}</Text> : null}
    </ScrollView>
  );
}

function Choice({ on, title, sub, onPress }: { on: boolean; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.row1, on && s.on]}>
      <Text style={type.name}>{title}</Text>
      <Text style={type.meta}>{sub}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 8, backgroundColor: '#fff' },
  head: { marginTop: 12 },
  empty: { color: colors.muted, fontSize: 13, padding: 12, borderRadius: 12, backgroundColor: colors.soft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
  row1: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 2, backgroundColor: '#fff' },
  hub: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, gap: 2, marginLeft: 14, backgroundColor: '#f8fafc' },
  on: { borderWidth: 2, borderColor: AMBER, backgroundColor: '#fffbeb' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  btn: { height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
