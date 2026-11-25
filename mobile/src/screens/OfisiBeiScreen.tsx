import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable, Switch } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiBei'>;

const GREEN = '#15803d';
const BLUE = '#1d4ed8';
const P_ = OFFICE_RULES.pricing;
/** The path part of a shared endpoint string, e.g. "GET /x/y" -> "/x/y". */
const pathOf = (ep: string) => ep.split(' ')[1];

interface Rule { chargeMode: 'value' | 'kg'; valuePercent: number; valueMinimum: number; source?: string; isDarEsSalaam?: boolean }
interface Rate { id?: number; destinationCity: string; ratePerKg: string; minimumCharge: string; estimatedDays: string }
interface PickupData { mode: 'none' | 'free' | 'fixed'; fee?: number | null; maxKm?: number | null; sameCityDelivery?: boolean | null; officePointSet?: boolean }

const shown = (v: unknown) => (v === '' || v == null || Number(v) === 0 ? '' : String(Number(v)));
const digits = (v: string) => v.replace(/[^0-9]/g, '');
const blankRate = (): Rate => ({ destinationCity: '', ratePerKg: '', minimumCharge: '', estimatedDays: String(P_.routeDefaults.estimatedDays) });
const fromServer = (r: any): Rate => ({ id: r.id, destinationCity: r.destinationCity || '', ratePerKg: shown(r.ratePerKg), minimumCharge: shown(r.minimumCharge), estimatedDays: String(r.estimatedDays ?? P_.routeDefaults.estimatedDays) });

/**
 * Bei zangu: the office's prices, in one screen. Same endpoints and rules as the web (OfficePrices,
 * ChargeRuleSection, OfficePickupCard). The live route range is on the walk-in form.
 */
export default function OfisiBeiScreen({ navigation }: P) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [city, setCity] = useState('');
  const [regions, setRegions] = useState<string[]>([]);

  const [rule, setRule] = useState<Rule | null>(null);
  const [chargeMode, setChargeMode] = useState<'value' | 'kg'>(P_.valueDefaults.chargeMode as 'value' | 'kg');
  const [valuePercent, setValuePercent] = useState(String(P_.valueDefaults.valuePercent));
  const [valueMinimum, setValueMinimum] = useState(String(P_.valueDefaults.valueMinimum));

  const [rates, setRates] = useState<Rate[]>([blankRate()]);

  const [goods, setGoods] = useState<string[] | null>(null);
  const [pickup, setPickup] = useState<PickupData | null>(null);
  const [pickupMode, setPickupMode] = useState<'none' | 'free' | 'fixed'>('none');
  const [pickupFee, setPickupFee] = useState('');
  const [pickupKm, setPickupKm] = useState('');
  const [sameCity, setSameCity] = useState(false);

  const byKg = !rule || chargeMode === 'kg';
  const regionFor = (c: string) => {
    const x = c.trim().toLowerCase();
    return x ? regions.find((n) => n.toLowerCase() === x) || null : null;
  };

  const applyPickup = (d: PickupData) => {
    setPickup(d);
    setPickupMode(d.mode || 'none');
    setPickupFee(d.fee != null ? String(d.fee) : '');
    setPickupKm(d.maxKm != null ? String(d.maxKm) : '');
    setSameCity(d.sameCityDelivery === true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ruleRes, profile, regionList, goodsRes, pickupRes] = await Promise.all([
        api.get<Rule>(pathOf(P_.endpoints.priceRuleGet)).catch(() => null),
        api.get<{ city?: string }>('/super-agents/my-profile').catch(() => ({} as { city?: string })),
        api.get<any[]>(pathOf(P_.endpoints.regions)).catch(() => [] as any[]),
        api.get<{ goodsTypes?: string[] }>(pathOf(P_.endpoints.goodsGet)).catch(() => null),
        api.get<PickupData>(pathOf(P_.endpoints.pickupGet)).catch(() => null),
      ]);
      if (ruleRes) {
        setRule(ruleRes);
        setChargeMode(ruleRes.chargeMode);
        setValuePercent(String(Number(ruleRes.valuePercent)));
        setValueMinimum(String(Number(ruleRes.valueMinimum)));
      }
      const c = (profile as { city?: string })?.city || '';
      setCity(c);
      setRegions(Array.isArray(regionList) ? regionList.map((x) => x?.name).filter(Boolean) : []);
      if (c) {
        const r: any = await api.get(pathOf(P_.endpoints.ratesGet).replace(':city', encodeURIComponent(c))).catch(() => null);
        setRates(Array.isArray(r) && r.length ? r.map(fromServer) : [blankRate()]);
      }
      setGoods(goodsRes ? goodsRes.goodsTypes || ['parcel'] : null);
      if (pickupRes) applyPickup(pickupRes);
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia. Jaribu tena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateRate = (i: number, patch: Partial<Rate>) => setRates((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  /** One Save for the route card: charge rule first, then the route rows (same order as the web). */
  const saveRoutes = async () => {
    const valid = rates.filter((r) => regionFor(r.destinationCity) && (!byKg || Number(r.ratePerKg) > 0));
    if (!rule && !valid.length) { setError('Weka angalau njia moja yenye mkoa na bei.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (rule) {
        const saved: any = await api.put(pathOf(P_.endpoints.priceRulePut), {
          chargeMode, valuePercent: Number(valuePercent), valueMinimum: Number(valueMinimum),
        });
        setRule(saved);
      }
      if (!valid.length) { setMessage('Imehifadhiwa'); return; }
      await api.post(pathOf(P_.endpoints.ratesPost), {
        rates: valid.map((r) => ({
          ...(r.id != null && { id: r.id }),
          destinationCity: r.destinationCity.trim(),
          ratePerKg: byKg ? Number(r.ratePerKg) : (Number(r.ratePerKg) || 0),
          minimumCharge: Number(r.minimumCharge) || 0,
          estimatedDays: Number(r.estimatedDays) || P_.routeDefaults.estimatedDays,
        })),
      });
      setMessage('Bei zimehifadhiwa');
      if (city) {
        const r: any = await api.get(`/super-agents/rates/${encodeURIComponent(city)}`).catch(() => null);
        if (Array.isArray(r) && r.length) setRates(r.map(fromServer));
      }
    } catch (e: any) {
      setError(e?.message || 'Imeshindwa kuhifadhi bei');
    } finally { setBusy(false); }
  };

  const saveGoods = async () => {
    if (!goods) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved: any = await api.put(pathOf(P_.endpoints.goodsPut), { goodsTypes: goods });
      setGoods(saved?.goodsTypes || goods);
      setMessage('Mizigo imehifadhiwa');
    } catch (e: any) { setError(e?.message || 'Imeshindwa kuhifadhi'); }
    finally { setBusy(false); }
  };

  const savePickup = async () => {
    if (!pickup) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved: any = await api.put(pathOf(P_.endpoints.pickupPut), {
        mode: pickupMode,
        fee: pickupMode === 'fixed' ? Number(digits(pickupFee)) : undefined,
        maxKm: pickupMode !== 'none' && digits(pickupKm) ? Number(digits(pickupKm)) : null,
        ...(pickup.sameCityDelivery !== null && pickup.sameCityDelivery !== undefined ? { sameCityDelivery: sameCity } : {}),
      });
      applyPickup(saved);
      setMessage('Imehifadhiwa. Wateja wataona huduma hii wakituma mzigo.');
    } catch (e: any) { setError(e?.message || 'Imeshindikana kuhifadhi.'); }
    finally { setBusy(false); }
  };

  const pickupCanSave = pickupMode !== 'fixed' || Number(digits(pickupFee)) > 0;

  if (loading) return <View style={s.wrap}><Text style={type.meta}>Inapakia…</Text></View>;

  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>Bei zangu</Text>
      {!!error && <Text style={[type.meta, { color: colors.danger }]}>{error}</Text>}
      {!!message && <Text style={[type.meta, { color: GREEN }]}>{message}</Text>}

      {/* Bei: how the office charges, then the route prices. One Save. */}
      <View style={s.card}>
        <Text style={type.name}>Jinsi unavyotoza</Text>
        {rule ? (
          <>
            <View style={s.chips}>
              <Chip label="Kwa thamani ya mzigo" on={chargeMode === 'value'} onPress={() => setChargeMode('value')} />
              <Chip label="Kwa kilo" on={chargeMode === 'kg'} onPress={() => setChargeMode('kg')} />
            </View>
            {chargeMode === 'value' ? (
              <View style={s.two}>
                <Field label="Asilimia (%)" value={valuePercent} onChangeText={(v) => setValuePercent(v)} keyboardType="decimal-pad" />
                <Field label="Kiwango cha chini (TZS)" value={valueMinimum} onChangeText={(v) => setValueMinimum(v)} keyboardType="number-pad" />
              </View>
            ) : (
              <Text style={type.meta}>Bei za kilo zinawekwa kwenye njia hapa chini.</Text>
            )}
          </>
        ) : (
          <Text style={type.meta}>Kwa sasa unaweza kuweka njia za bei tu.</Text>
        )}

        <Text style={[type.name, { marginTop: 10 }]}>Njia zako</Text>
        <Text style={type.meta}>Mikoa unayotuma mizigo kutoka {city || 'ofisi yako'}. Bila mkoa hapa, ofisi yako haionekani kwa wanaotuma.</Text>
        {rates.map((r, i) => {
          const region = regionFor(r.destinationCity);
          const legacy = !region && !!r.destinationCity.trim();
          const taken = new Set(rates.filter((_, j) => j !== i).map((x) => regionFor(x.destinationCity)).filter(Boolean));
          return (
            <View key={r.id ?? `new-${i}`} style={s.route}>
              <Text style={type.small}>Mkoa wa kufikia</Text>
              <View style={s.chips}>
                {regions.filter((n) => !taken.has(n)).slice(0, 24).map((n) => (
                  <Chip key={n} label={n} on={region === n} onPress={() => updateRate(i, { destinationCity: n })} />
                ))}
              </View>
              {legacy && <Text style={[type.small, { color: '#d97706' }]}>"{r.destinationCity.trim()}" haipo kwenye orodha. Chagua upya.</Text>}
              {byKg && (
                <View style={s.two}>
                  <Field label="Bei kwa kilo (TZS)" value={r.ratePerKg} onChangeText={(v) => updateRate(i, { ratePerKg: v })} keyboardType="number-pad" />
                  <Field label="Kiwango cha chini (TZS)" value={r.minimumCharge} onChangeText={(v) => updateRate(i, { minimumCharge: v })} keyboardType="number-pad" />
                </View>
              )}
              <Field label="Siku" value={r.estimatedDays} onChangeText={(v) => updateRate(i, { estimatedDays: v })} keyboardType="number-pad" />
            </View>
          );
        })}
        <Pressable onPress={() => setRates((prev) => [...prev, blankRate()])} accessibilityRole="button" style={s.dashed}>
          <Text style={[type.name, { color: BLUE, textAlign: 'center' }]}>+ Ongeza njia</Text>
        </Pressable>
        <Button title={busy ? '…' : 'Hifadhi bei'} dark={false} onPress={busy ? () => {} : saveRoutes} />
      </View>

      {/* Mizigo unayopokea (goods types) */}
      {goods && (
        <View style={s.card}>
          <Text style={type.name}>Mizigo unayopokea</Text>
          <Text style={type.meta}>Wateja wanaona ofisi yako kwa aina ulizochagua tu.</Text>
          {P_.goodsTypes.map(([k, title]) => (
            <View key={k} style={s.checkRow}>
              <Switch value={goods.includes(k)} onValueChange={() => setGoods((g) => (g || []).includes(k) ? (g || []).filter((x) => x !== k) : [...(g || []), k])} />
              <Text style={[type.name, { flex: 1 }]}>{title}</Text>
            </View>
          ))}
          <Button title={busy ? '…' : 'Hifadhi mizigo'} dark={false} onPress={busy || !goods.length ? () => {} : saveGoods} />
        </View>
      )}

      {/* Kuchukua mzigo kwa mteja */}
      {pickup && (
        <View style={s.card}>
          <Text style={type.name}>Kuchukua mzigo kwa mteja</Text>
          {P_.pickupModes.map(([k, title]) => (
            <Pressable key={k} onPress={() => setPickupMode(k as 'none' | 'free' | 'fixed')} accessibilityRole="radio"
              style={[s.radio, pickupMode === k && s.radioOn]}>
              <Text style={type.name}>{title}</Text>
            </Pressable>
          ))}
          {pickupMode === 'fixed' && (
            <Field label="Bei ya kuchukua (TZS)" value={pickupFee} onChangeText={(v) => setPickupFee(digits(v))} keyboardType="number-pad" />
          )}
          {pickupMode !== 'none' && (
            <Field label="Umbali wa juu kutoka ofisini (km, hiari)" value={pickupKm} onChangeText={(v) => setPickupKm(digits(v))} keyboardType="number-pad" />
          )}
          {pickup.sameCityDelivery !== null && pickup.sameCityDelivery !== undefined && (
            <View style={s.toggleRow}>
              <Text style={[type.name, { flex: 1 }]}>Nasafirisha pia ndani ya mji wangu</Text>
              <Switch value={sameCity} onValueChange={setSameCity} />
            </View>
          )}
          <Button title={busy ? '…' : 'Hifadhi'} dark={false} onPress={busy || !pickupCanSave ? () => {} : savePickup} />
        </View>
      )}

      <Text style={type.small}>Mahali pa ofisi (GPS) na mipangilio mingine ya ofisi: tumia KenteXa kwenye kivinjari.</Text>
      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button"><Text style={[type.name, { textAlign: 'center' }]}>Rudi</Text></Pressable>
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

function Field({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: 'default' | 'number-pad' | 'decimal-pad' }) {
  return (
    <View style={s.field}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType || 'default'} style={s.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 16 },
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 10 },
  two: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, fontFamily: F.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontFamily: F.bold, fontSize: 13, color: colors.ink },
  route: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 10, gap: 8 },
  dashed: { borderWidth: 1, borderColor: '#bfdbfe', borderStyle: 'dashed', borderRadius: 10, padding: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  radioOn: { borderColor: BLUE, borderWidth: 2, backgroundColor: '#eff6ff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
