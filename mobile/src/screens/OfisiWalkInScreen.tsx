import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';
import { regionRelation, type RelationT } from '../office/regionRules';

type P = NativeStackScreenProps<RootStackParams, 'WalkIn'>;

const GREEN = '#15803d';
/** The last walk-in receipt, kept until "Mzigo mpya" (the web keeps it the same way). No claim code is stored. */
export const LAST_WALKIN_KEY = 'ofisi.lastWalkIn';
export async function readLastWalk(): Promise<any | null> {
  try {
    const raw = await SecureStore.getItemAsync(LAST_WALKIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const BLUE = '#1d4ed8';
const RULES = OFFICE_RULES.walkIn;
const RULES_ROUTE_RANGE = OFFICE_RULES.pricing.endpoints.routeRange.split(' ')[1].split('?')[0];
const money0 = (n: unknown) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

type ServicePath = 'local_agent' | 'van' | 'intercity';
type Relation = RelationT;

interface Form {
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  description: string;
  weightKg: string;
  declaredValue: string;
  shippingFeeCollected: string;
  paymentMethod: 'cash' | 'mobile_money';
  notes: string;
  priceChangeReason: string;
}

const EMPTY: Form = {
  senderName: '', senderPhone: '', recipientName: '', recipientPhone: '',
  deliveryAddress: '', description: '', weightKg: '', declaredValue: '', shippingFeeCollected: '',
  paymentMethod: 'cash', notes: '', priceChangeReason: '',
};

/** A place from GET /location-intelligence/places (the same candidates the web picker shows). */
interface Place {
  displayLabel: string;
  regionName?: string | null;
  districtName?: string | null;
  wardName?: string | null;
  placeRef?: { providerPlaceId?: string; providerKey?: string } | null;
}
interface Hub { id: number; businessName?: string; city?: string }
/** GET /super-agents/me/route-range: the anonymous market range only, never another office's price. */
interface RouteRange { destinationCity?: string; weightKg?: number; range?: { low: number; middle: number; high: number } | null; officeCount?: number; position?: 'low' | 'middle' | 'high' | null; mine?: number | null }
const POSITION_SW: Record<string, string> = { low: 'Bei yako iko chini sokoni', middle: 'Bei yako iko katikati ya soko', high: 'Bei yako iko juu sokoni' };
interface Route { estimatedDays?: number; transitCity?: string | null; baseShippingFee?: number | null }
interface Estimate { confidence?: string; displayPrice?: string; displayNote?: string; via?: string; estimatedDays?: number }
interface Quote {
  noSuggestion?: boolean;
  total?: number;
  pickup?: { status?: string; amount?: number };
  delivery?: { status?: string; amount?: number };
  transport?: { mode?: string; amount?: number; ratePerKg?: number; minimum?: number; percent?: number };
  ruleSource?: string;
}
interface Receipt {
  trackingNumber?: string;
  customerNumber?: string;
  senderSmsSent?: boolean;
  shipmentClaim?: { receiptSecret?: string | null } | null;
}

const money = (n: unknown) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
const lineText = (l?: { status?: string; amount?: number }) =>
  !l || l.status === 'not_included' ? 'Haihusiki' : l.status === 'free' ? 'Bure' : money(l.amount);
/** Same rule as the web (OfficePricePreview.feeDiffers). */
const feeDiffers = (quote: Quote | null, fee: string) =>
  !!quote && !quote.noSuggestion && fee !== '' && Number(fee) !== Number(quote.total);

/**
 * Mteja wa Walk-In. Same steps and same rules as the web counter form (SuperAgentDashboard, walk-in):
 * destination from the place search, region rule for local or intercity, hub for non-local paths,
 * live office price with a reason when the fee differs, and the same request key on a retry.
 */
export default function OfisiWalkInScreen({ navigation, route }: P) {
  const officeCity: string = (route.params as { city?: string } | undefined)?.city || '';
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Opened from "Risiti ya mwisho" on the POKEA screen: show that receipt straight away.
  const initialReceipt = ((route.params as { receipt?: Receipt } | undefined)?.receipt) || null;
  const [receipt, setReceipt] = useState<Receipt | null>(initialReceipt);

  const [destText, setDestText] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [dest, setDest] = useState<Place | null>(null);
  const [relation, setRelation] = useState<Relation>(null);
  const [override, setOverride] = useState(false);
  const [servicePath, setServicePath] = useState<ServicePath>('local_agent');
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubId, setHubId] = useState<number | null>(null);
  const [routeInfo, setRouteInfo] = useState<Route | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [routeRange, setRouteRange] = useState<RouteRange | null>(null);

  // Reused on a retry of the same details, new for a changed form (same rule as the web).
  const pending = useRef<{ fingerprint: string; requestKey: string } | null>(null);
  const lastQuoteTotal = useRef<number | null>(null);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Place search, as the web picker (220 ms debounce, at least 2 letters).
  useEffect(() => {
    const q = destText.trim();
    if (q.length < 2 || (dest && q === dest.displayLabel)) { setPlaces([]); return; }
    const t = setTimeout(async () => {
      try {
        const r: any = await api.get(`/location-intelligence/places?q=${encodeURIComponent(q)}&limit=8`);
        setPlaces(Array.isArray(r?.candidates) ? r.candidates : []);
      } catch { setPlaces([]); }
    }, 220);
    return () => clearTimeout(t);
  }, [destText, dest]);

  const pickPlace = async (p: Place) => {
    const city = p.regionName || p.districtName || '';
    setDest(p);
    setDestText(p.displayLabel);
    setPlaces([]);
    setForm((f) => ({ ...f, deliveryAddress: p.displayLabel || f.deliveryAddress }));
    setHubId(null);
    setOverride(false);
    const rel = regionRelation(officeCity, p.regionName);
    setRelation(rel);
    setServicePath(rel === 'other' ? 'intercity' : 'local_agent');
    if (!city) return;
    try {
      const h: any = await api.get(`/super-agents/hubs/${encodeURIComponent(city)}`);
      const list: Hub[] = Array.isArray(h) ? h : [];
      setHubs(list);
      if (list.length === 1) setHubId(list[0].id);
    } catch { setHubs([]); }
    try {
      setRouteInfo(await api.get<Route>(`/super-agents/route/${encodeURIComponent(officeCity)}/${encodeURIComponent(city)}`));
    } catch { setRouteInfo(null); }
    try {
      const params = new URLSearchParams({
        from: officeCity, to: p.regionName || city, weight: String(form.weightKg || 1),
        ...(p.districtName ? { destDistrict: p.districtName } : {}),
      });
      setEstimate(await api.get<Estimate>(`/pricing/estimate?${params.toString()}`));
    } catch { setEstimate(null); }
  };

  // Market range for the destination, as the web RouteRangePanel (400 ms debounce).
  useEffect(() => {
    const city = dest ? (dest.regionName || dest.districtName || '') : '';
    if (!city) { setRouteRange(null); return; }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ destinationCity: city, ...(Number(form.weightKg) > 0 ? { weightKg: String(Number(form.weightKg)) } : {}) });
        setRouteRange(await api.get<RouteRange>(`${RULES_ROUTE_RANGE}?${params.toString()}`));
      } catch { setRouteRange(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [dest, form.weightKg]);

  // Live office price, as the web preview (400 ms debounce).
  useEffect(() => {
    const value = Number(form.declaredValue);
    if (!value || value <= 0 || !dest) { setQuote(null); setQuoteError(''); return; }
    const t = setTimeout(async () => {
      try {
        setQuoteError('');
        const q = await api.post<Quote>('/super-agents/me/price-quote', {
          declaredValue: value,
          weightKg: form.weightKg ? Number(form.weightKg) : undefined,
          destinationCity: dest.regionName || dest.districtName || dest.displayLabel,
          servicePath,
          deliveryAddress: form.deliveryAddress,
        });
        setQuote(q);
        // Fill the fee with the office price while the fee is empty or still the last suggested total.
        if (!q.noSuggestion && typeof q.total === 'number') {
          setForm((f) => (f.shippingFeeCollected === '' || Number(f.shippingFeeCollected) === lastQuoteTotal.current
            ? { ...f, shippingFeeCollected: String(q.total) } : f));
          lastQuoteTotal.current = q.total;
        }
      } catch (e: any) {
        setQuote(null);
        setQuoteError(e?.message || 'Imeshindwa kupata bei ya ofisi');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.declaredValue, form.weightKg, form.deliveryAddress, dest, servicePath]);

  const differs = feeDiffers(quote, form.shippingFeeCollected);
  const intercityLocked = relation === 'other' && !override;
  const sameRegion = relation === 'same' && !override;

  const submit = async () => {
    setError('');
    if (!form.senderName.trim() || !form.recipientName.trim() || !dest) {
      setError('Jaza sehemu zote zinazohitajika');
      return;
    }
    if (!form.declaredValue || Number(form.declaredValue) <= 0) {
      setError('Weka thamani ya mzigo (lazima iwe zaidi ya sifuri)');
      return;
    }
    if (servicePath !== 'local_agent' && hubs.length > 1 && !hubId) {
      setError('Chagua hub ya mpokeaji');
      return;
    }
    if (differs && form.priceChangeReason.trim().length < RULES.reasonMinLength) {
      setError('Ada ni tofauti na bei ya ofisi. Andika sababu ya kubadilisha bei.');
      return;
    }
    const destinationCity = dest.regionName || dest.districtName || dest.displayLabel;
    const payload = {
      senderName: form.senderName,
      senderPhone: form.senderPhone,
      recipientName: form.recipientName,
      recipientPhone: form.recipientPhone,
      destinationCity,
      deliveryAddress: form.deliveryAddress,
      description: form.description,
      notes: form.notes,
      paymentMethod: form.paymentMethod,
      weightKg: form.weightKg ? Number(form.weightKg) : undefined,
      declaredValue: Number(form.declaredValue),
      shippingFeeCollected: Number(form.shippingFeeCollected || 0),
      priceChangeReason: differs ? form.priceChangeReason.trim() : undefined,
      servicePath,
      destinationSuperAgentId: servicePath !== 'local_agent' && hubId ? hubId : undefined,
      originCity: officeCity,
    };
    const fingerprint = JSON.stringify(payload);
    const requestKey = pending.current?.fingerprint === fingerprint
      ? pending.current.requestKey
      : `walkin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    pending.current = { fingerprint, requestKey };

    setBusy(true);
    try {
      const res = await api.post<Receipt>('/super-agents/offline-intercity', { ...payload, requestKey });
      pending.current = null;
      setReceipt(res);
      SecureStore.setItemAsync(LAST_WALKIN_KEY, JSON.stringify({ ...res, shipmentClaim: null })).catch(() => undefined);
    } catch (e: any) {
      setError(e?.message || 'Imeshindwa kuunda agizo');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm(EMPTY);
    setReceipt(null);
    SecureStore.deleteItemAsync(LAST_WALKIN_KEY).catch(() => undefined);
    setError('');
    setDest(null);
    setDestText('');
    setRelation(null);
    setOverride(false);
    setServicePath('local_agent');
    setHubs([]);
    setHubId(null);
    setRouteInfo(null);
    setEstimate(null);
    setQuote(null);
    lastQuoteTotal.current = null;
    pending.current = null;
  };

  if (receipt) {
    const number = receipt.customerNumber || receipt.trackingNumber || '';
    const secret = receipt.shipmentClaim?.receiptSecret;
    return (
      <ScrollView contentContainerStyle={s.body}>
        <Text style={type.title}>Risiti</Text>
        <View style={s.receipt}>
          <Text style={type.small}>Namba ya mzigo</Text>
          <Text style={s.big}>{number}</Text>
          {receipt.senderSmsSent === true && <Text style={type.meta}>SMS ya malipo imetumwa kwa mtumaji</Text>}
          {receipt.senderSmsSent === false && <Text style={[type.meta, { color: '#d97706' }]}>SMS kwa mtumaji haikutumwa. Tuma tena kwenye kivinjari.</Text>}
          {!!secret && (
            <>
              <Text style={type.small}>Namba ya kuthibitisha (itaonekana mara moja tu)</Text>
              <Text style={s.code}>{String(secret).toUpperCase().match(/.{1,4}/g)?.join(' ')}</Text>
            </>
          )}
        </View>
        <Button title="Mzigo mpya" dark={false} onPress={reset} />
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button"><Text style={[type.name, { textAlign: 'center', marginTop: 8 }]}>Rudi ofisini</Text></Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>Mteja wa Walk-In</Text>
      <Text style={type.meta}>Mteja amefika ofisini. Jaza taarifa za mzigo.</Text>

      <Text style={s.section}>Mtumaji</Text>
      <Field label="Jina la mtumaji *" value={form.senderName} onChangeText={set('senderName')} />
      <Field label="Simu ya mtumaji" value={form.senderPhone} onChangeText={set('senderPhone')} keyboardType="phone-pad" />

      <Text style={s.section}>Mpokeaji</Text>
      <Field label="Jina la mpokeaji *" value={form.recipientName} onChangeText={set('recipientName')} />
      <Field label="Simu ya mpokeaji" value={form.recipientPhone} onChangeText={set('recipientPhone')} keyboardType="phone-pad" />

      <Field label="Mji wa mwisho * (andika na uchague)" value={destText} onChangeText={(v) => { setDestText(v); setDest(null); setRelation(null); setHubs([]); setHubId(null); setRouteInfo(null); setEstimate(null); setQuote(null); }} />
      {places.map((p, i) => (
        <Pressable key={`${p.placeRef?.providerPlaceId || i}`} onPress={() => pickPlace(p)} accessibilityRole="button" style={s.place}>
          <Text style={type.name}>{p.displayLabel}</Text>
          <Text style={type.small}>{[p.wardName, p.districtName, p.regionName].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
      <Field label="Anwani ya kufikisha" value={form.deliveryAddress} onChangeText={set('deliveryAddress')} />

      {!!dest && (
        <View style={s.box}>
          <Text style={type.small}>Mzigo ufikeje?</Text>
          {intercityLocked && <Text style={type.meta}>Mkoa mwingine: Intercity imechaguliwa.</Text>}
          {sameRegion && <Text style={type.meta}>Mkoa uleule: usafirishaji wa ndani.</Text>}
          <View style={s.chips}>
            {!intercityLocked && !sameRegion && (
              <>
                <Chip label="Agent delivery" on={servicePath === 'local_agent'} onPress={() => { setServicePath('local_agent'); setHubId(null); }} />
                <Chip label="Kentexa Van" on={servicePath === 'van'} onPress={() => { setServicePath('van'); setHubId(null); }} />
              </>
            )}
            {(!sameRegion || override) && (
              <Chip label="Intercity" on={servicePath === 'intercity'} onPress={() => setServicePath('intercity')} />
            )}
          </View>
          {(intercityLocked || sameRegion) && (
            <Pressable onPress={() => setOverride((o) => !o)} accessibilityRole="button">
              <Text style={[type.small, { color: BLUE }]}>{override ? 'Rudi kwenye chaguo la kiotomatiki' : 'Badilisha kwa mkono'}</Text>
            </Pressable>
          )}
          {servicePath !== 'local_agent' && hubs.length > 0 && (
            <>
              <Text style={type.small}>Ofisi ya kupokea {hubs.length > 1 ? '*' : ''}</Text>
              <View style={s.chips}>
                {hubs.map((h) => (
                  <Chip key={h.id} label={`${h.businessName || 'Ofisi'} · ${h.city || ''}`} on={hubId === h.id} onPress={() => setHubId(h.id)} />
                ))}
              </View>
            </>
          )}
          {routeInfo && (
            <Text style={type.meta}>
              {routeInfo.transitCity ? `via ${routeInfo.transitCity} · ` : ''}Siku {routeInfo.estimatedDays ?? '—'}
              {routeInfo.baseShippingFee ? ` · ~${money(routeInfo.baseShippingFee)}` : ''}
            </Text>
          )}
          {routeRange && (
            <View style={s.quote}>
              <Text style={[type.small, { fontFamily: F.bold }]}>BEI SOKONI · {routeRange.destinationCity} · {routeRange.weightKg} kg</Text>
              {routeRange.range ? (
                <>
                  <Text style={type.name}>{money0(routeRange.range.low)} – {money0(routeRange.range.high)}</Text>
                  <Text style={type.small}>Katikati: {money0(routeRange.range.middle)} · ofisi {routeRange.officeCount}</Text>
                  {routeRange.position
                    ? <Text style={[type.small, { color: BLUE, fontFamily: F.bold }]}>{POSITION_SW[routeRange.position]} ({money0(routeRange.mine)})</Text>
                    : <Text style={type.small}>Hujaweka bei ya kilo ya mji huu.</Text>}
                </>
              ) : (
                <Text style={type.small}>Ofisi chache mno kwenye njia hii kuonyesha bei ya soko.</Text>
              )}
              <Text style={type.small}>Ni mwongozo tu: unaweza kuandika ada yoyote.</Text>
            </View>
          )}
          {estimate && !quote && (
            <Text style={type.meta}>{estimate.confidence === 'exact' ? 'Bei halisi' : 'Makisio ya bei'}: {estimate.displayPrice || ''}{estimate.via ? ` · ${estimate.via}` : ''}</Text>
          )}
        </View>
      )}

      <Text style={s.section}>Mzigo</Text>
      <Field label="Maelezo ya mzigo" value={form.description} onChangeText={set('description')} />
      <Field label="Uzito (kg)" value={form.weightKg} onChangeText={set('weightKg')} keyboardType="decimal-pad" />
      <Field label="Thamani ya mzigo (TZS) *" value={form.declaredValue} onChangeText={set('declaredValue')} keyboardType="number-pad" />

      {quote && (
        <View style={s.quote}>
          <Text style={[type.small, { color: BLUE, fontFamily: F.bold }]}>BEI YA OFISI</Text>
          {quote.noSuggestion ? (
            <Text style={type.meta}>Hakuna bei ya kilo ya ofisi kwa mji huu. Andika ada mwenyewe.</Text>
          ) : (
            <>
              <Row k="Kuchukua" v={lineText(quote.pickup)} />
              <Row k="Usafirishaji" v={quote.transport?.mode === 'same_city' ? 'Haihusiki' : money(quote.transport?.amount)} />
              <Row k="Kufikisha" v={lineText(quote.delivery)} />
              <Row k="Jumla" v={money(quote.total)} strong />
            </>
          )}
        </View>
      )}
      {!!quoteError && <Text style={[type.meta, { color: colors.danger }]}>{quoteError}</Text>}

      <Text style={s.section}>Malipo</Text>
      <Field label="Ada ya usafirishaji (TZS)" value={form.shippingFeeCollected} onChangeText={set('shippingFeeCollected')} keyboardType="number-pad" />
      {differs && (
        <>
          <Text style={[type.meta, { color: '#b45309' }]}>Ada ni tofauti na bei ya ofisi ({money(quote?.total)}). Andika sababu.</Text>
          <Field label="Sababu ya kubadilisha bei *" value={form.priceChangeReason} onChangeText={set('priceChangeReason')} />
        </>
      )}
      <View style={s.chips}>
        <Chip label="Taslimu" on={form.paymentMethod === 'cash'} onPress={() => setForm((f) => ({ ...f, paymentMethod: 'cash' }))} />
        <Chip label="Simu / Mpesa" on={form.paymentMethod === 'mobile_money'} onPress={() => setForm((f) => ({ ...f, paymentMethod: 'mobile_money' }))} />
      </View>
      <Field label="Maelezo ya ziada" value={form.notes} onChangeText={set('notes')} />

      {!!error && <Text style={[type.meta, { color: colors.danger }]}>{error}</Text>}
      <Button title={busy ? 'Inatuma…' : 'Tengeneza mzigo'} dark={false} onPress={busy ? () => {} : submit} />
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[type.small, strong && { fontFamily: F.black, color: colors.ink }]}>{k}</Text>
      <Text style={[type.small, { fontFamily: F.bold, color: colors.ink }, strong && { fontFamily: F.black }]}>{v}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'decimal-pad' }) {
  return (
    <View style={s.field}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType || 'default'} style={s.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 10, backgroundColor: '#fff' },
  section: { fontFamily: F.bold, fontSize: 14, color: colors.ink, marginTop: 10 },
  field: { gap: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, fontFamily: F.regular },
  place: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10, gap: 2 },
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontFamily: F.bold, fontSize: 14, color: colors.ink },
  quote: { borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  receipt: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 8 },
  big: { fontFamily: F.black, fontSize: 24, color: colors.ink },
  code: { fontFamily: F.black, fontSize: 22, color: GREEN, letterSpacing: 1 },
});
