import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams, 'WalkIn'>;

const GREEN = '#15803d';

interface Form {
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  destinationCity: string;
  deliveryAddress: string;
  description: string;
  weightKg: string;
  declaredValue: string;
  shippingFeeCollected: string;
  paymentMethod: 'cash' | 'mobile_money' | string;
  notes: string;
}

const EMPTY: Form = {
  senderName: '', senderPhone: '', recipientName: '', recipientPhone: '',
  destinationCity: '', deliveryAddress: '', description: '',
  weightKg: '', declaredValue: '', shippingFeeCollected: '', paymentMethod: 'cash', notes: '',
};

/** The receipt the server returns from POST /super-agents/offline-intercity. Only the fields the app shows. */
interface Receipt {
  trackingNumber?: string;
  customerNumber?: string;
  senderSmsSent?: boolean;
  shipmentClaim?: { receiptSecret?: string | null } | null;
}

/**
 * Mteja wa Walk-In: the sender is at the office counter. Same endpoint and same request key rule as the
 * web (SuperAgentDashboard.handleWalkSubmit): a retry with the same details reuses the same key, so the
 * server returns the same receipt instead of making a second parcel.
 *
 * Not yet in the app (still on the web): price quote, route lookup and destination-hub choice for
 * intercity parcels. The server still checks every rule; a refusal shows its message here.
 */
export default function OfisiWalkInScreen({ navigation }: P) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // Reused on a retry of the same details, new for a changed form (same rule as the web).
  const pending = useRef<{ fingerprint: string; requestKey: string } | null>(null);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    if (!form.senderName.trim() || !form.recipientName.trim() || !form.destinationCity.trim()) {
      setError('Jaza sehemu zote zinazohitajika');
      return;
    }
    if (!form.declaredValue || Number(form.declaredValue) <= 0) {
      setError('Weka thamani ya mzigo (lazima iwe zaidi ya sifuri)');
      return;
    }
    const payload = {
      ...form,
      weightKg: form.weightKg ? Number(form.weightKg) : undefined,
      declaredValue: Number(form.declaredValue),
      shippingFeeCollected: Number(form.shippingFeeCollected || 0),
      servicePath: 'local_agent',
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
    } catch (e: any) {
      setError(e?.message || 'Imeshindwa kuunda agizo');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm(EMPTY);
    setReceipt(null);
    setError('');
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
      <Field label="Mji wa mpokeaji *" value={form.destinationCity} onChangeText={set('destinationCity')} />
      <Field label="Anwani ya kufikisha" value={form.deliveryAddress} onChangeText={set('deliveryAddress')} />

      <Text style={s.section}>Mzigo</Text>
      <Field label="Maelezo ya mzigo" value={form.description} onChangeText={set('description')} />
      <Field label="Uzito (kg)" value={form.weightKg} onChangeText={set('weightKg')} keyboardType="decimal-pad" />
      <Field label="Thamani ya mzigo (TZS) *" value={form.declaredValue} onChangeText={set('declaredValue')} keyboardType="number-pad" />

      <Text style={s.section}>Malipo</Text>
      <Field label="Ada ya usafirishaji (TZS)" value={form.shippingFeeCollected} onChangeText={set('shippingFeeCollected')} keyboardType="number-pad" />
      <View style={s.chips}>
        {(['cash', 'mobile_money'] as const).map((m) => (
          <Pressable key={m} onPress={() => setForm((f) => ({ ...f, paymentMethod: m }))} accessibilityRole="button"
            style={[s.chip, form.paymentMethod === m && s.chipOn]}>
            <Text style={[s.chipText, form.paymentMethod === m && { color: '#fff' }]}>{m === 'cash' ? 'Taslimu' : 'Simu / Mpesa'}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Maelezo ya ziada" value={form.notes} onChangeText={set('notes')} />

      {!!error && <Text style={[type.meta, { color: colors.danger }]}>{error}</Text>}
      <Button title={busy ? 'Inatuma…' : 'Tengeneza mzigo'} dark={false} onPress={busy ? () => {} : submit} />
    </ScrollView>
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
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontFamily: F.bold, fontSize: 14, color: colors.ink },
  receipt: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 8 },
  big: { fontFamily: F.black, fontSize: 24, color: colors.ink },
  code: { fontFamily: F.black, fontSize: 22, color: GREEN, letterSpacing: 1 },
});
