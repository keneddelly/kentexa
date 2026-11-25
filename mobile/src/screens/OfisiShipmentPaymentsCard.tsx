import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { colors, type } from '../theme';
import { OFFICE_RULES } from '../office/officeRules';

/**
 * "Malipo ya kuweka": send-form parcels this office received and has no payment for yet.
 * The office's own record of what the sender paid it (KenteXa never holds the money).
 * Same endpoints, rules and wording as the web (OfficeShipmentPayments.js).
 */
const SP = OFFICE_RULES.shipmentPayments;
const GREEN = '#15803d';
const BLUE = '#1d4ed8';
type Method = 'cash' | 'mobile_money';

interface PendingParcel {
  parcelId: number;
  waybill?: string | null;
  trackingNumber?: string | null;
  sender?: { name?: string | null } | null;
  itemDescription?: string | null;
  destinationCity?: string | null;
  amountDue?: number | null;
}
interface Pending { methods?: Method[]; parcels?: PendingParcel[] }

const digits = (v: string) => v.replace(/[^0-9]/g, '');
const tzs = (n: number) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

export default function OfisiShipmentPaymentsCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Pending | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.get<Pending>(SP.endpoints.pending.split(' ')[1])); }
    catch { setData(null); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data || !data.parcels?.length) {
    return message ? <Text style={[type.meta, styles.ok]}>{message}</Text> : null;
  }
  const methods = (data.methods && data.methods.length ? data.methods : [SP.defaultMethod]) as Method[];

  return (
    <View style={styles.wrap}>
      <Text style={[type.name, styles.title]}>{SP.sectionTitle} ({data.parcels.length})</Text>
      {message ? <Text style={[type.meta, styles.ok]}>{message}</Text> : null}
      {data.parcels.map((row) => (
        <PaymentRow key={row.parcelId} row={row} methods={methods}
          onSaved={(label) => { setMessage(SP.savedMessage.replace('{number}', label)); load(); }} />
      ))}
    </View>
  );
}

function PaymentRow({ row, methods, onSaved }: { row: PendingParcel; methods: Method[]; onSaved: (label: string) => void }) {
  const [amount, setAmount] = useState(row.amountDue ? String(row.amountDue) : '');
  const [method, setMethod] = useState<Method>(SP.defaultMethod as Method);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const value = Number(digits(amount));
  const canSave = !busy && value > 0 && value <= SP.maxAmount;
  const label = row.waybill || row.trackingNumber || `#${row.parcelId}`;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(SP.endpoints.record.split(' ')[1], {
        parcelId: row.parcelId,
        amount: value,
        method,
        reference: method === 'mobile_money' && reference.trim() ? reference.trim().slice(0, SP.referenceMaxLength) : undefined,
      });
      onSaved(label);
    } catch (e: any) {
      setError(e?.message || SP.errorMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={type.name}>{label}</Text>
        {row.amountDue != null && <Text style={type.small}>Bei: {tzs(row.amountDue)}</Text>}
      </View>
      <Text style={type.meta}>
        {row.itemDescription || 'Mzigo'} → {row.destinationCity || '—'} · Mtumaji: {row.sender?.name || '—'}
      </Text>

      <Text style={[type.small, styles.label]}>Kiasi alicholipa (TZS)</Text>
      <TextInput value={value ? value.toLocaleString('en-US') : ''} keyboardType="number-pad"
        onChangeText={(t) => setAmount(digits(t))} style={styles.input} placeholderTextColor={colors.muted} />

      {methods.length > 1 && (
        <View style={styles.methods} accessibilityRole="radiogroup">
          {methods.map((m) => (
            <Pressable key={m} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ selected: method === m }}
              style={[styles.method, method === m && styles.methodOn]}>
              <Text style={[styles.methodText, method === m && { color: BLUE }]}>
                {(SP.methodLabels as Record<string, string>)[m] || m}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {method === 'mobile_money' && (
        <TextInput value={reference} onChangeText={setReference} placeholder="Namba ya muamala (hiari)"
          placeholderTextColor={colors.muted} style={[styles.input, { marginTop: 8 }]} />
      )}
      {error ? <Text style={[type.meta, { color: '#b91c1c' }]}>{error}</Text> : null}

      <Pressable onPress={save} disabled={!canSave} accessibilityRole="button"
        style={[styles.save, !canSave && { opacity: 0.5 }]}>
        <Text style={styles.saveText}>{busy ? '…' : `${SP.saveLabel} (${((SP.methodLabels as Record<string, string>)[method] || method).toLowerCase()})`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  title: { marginTop: 4 },
  ok: { color: GREEN, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 6, backgroundColor: '#fff' },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  label: { marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
  methods: { flexDirection: 'row', gap: 8, marginTop: 8 },
  method: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  methodOn: { borderWidth: 2, borderColor: BLUE, backgroundColor: '#eff6ff' },
  methodText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  save: { height: 44, marginTop: 10, borderRadius: 10, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
