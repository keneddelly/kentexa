import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiShehena'>;

/**
 * Shehena (batch): receive a shehena that is coming here with its 6-digit code (or a reason),
 * see the shehena on the way with its code, and open batches to add parcels or dispatch.
 * Same endpoints and rules as the web (ShehenaHandover.js, SuperAgentDashboard.js).
 */
const SH = OFFICE_RULES.shehena;
const GREEN = '#15803d';
const BLUE = '#1d4ed8';

interface Incoming { id: number; totalParcels?: number; fromOffice?: string | null; originCity?: string | null; fromPhone?: string | null; transportCompany?: string | null; transportRef?: string | null; dispatchTime?: string | null }
interface Sent { id: number; destinationCity?: string | null; totalParcels?: number; handoverCode?: string | null; status?: string | null; transportCompany?: string | null; transportConfirmedAt?: string | null; dispatchTime?: string | null }
interface Open { id: number; destinationCity?: string | null; totalParcels?: number; lastMileSuperAgent?: { businessName?: string | null } | null; lastMileContactName?: string | null }

const digits = (v: string) => v.replace(/\D/g, '').slice(0, SH.receiveCodeLength);
const pathOf = (ep: string) => ep.split(' ')[1];

export default function OfisiShehenaScreen({ navigation }: P) {
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [open, setOpen] = useState<Open[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [noCode, setNoCode] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [i, s, o] = await Promise.all([
      api.get<Incoming[]>(pathOf(SH.endpoints.incoming)).catch(() => []),
      api.get<Sent[]>(pathOf(SH.endpoints.sent)).catch(() => []),
      api.get<Open[]>(pathOf(SH.endpoints.open)).catch(() => []),
    ]);
    setIncoming(Array.isArray(i) ? i : []);
    setSent(Array.isArray(s) ? s : []);
    setOpen(Array.isArray(o) ? o : []);
    setLoading(false);
  }, []);

  // Reload every time the screen is shown, so a batch just created or sent is listed.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canReceive = noCode ? reason.trim().length >= SH.receiveReasonMinLength : code.length === SH.receiveCodeLength;

  const receive = async (row: Incoming) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const path = pathOf(SH.endpoints.receive).replace(':id', String(row.id));
      const r: any = await api.post(path, noCode ? { reason: reason.trim().slice(0, SH.receiveReasonMaxLength) } : { code });
      const skipped = Array.isArray(r?.skipped) ? r.skipped.length : 0;
      setDone(`Shehena kutoka ${row.fromOffice || row.originCity}: vifurushi ${r?.received ?? 0} vimepokelewa${skipped ? `, ${skipped} havikupokelewa (angalia kimoja kimoja)` : ''}.`);
      setOpenId(null);
      load();
    } catch (e: any) {
      setError(e?.message || SH.messages.receiveFailed);
    } finally {
      setBusy(false);
    }
  };

  const startReceive = (id: number) => { setOpenId(id); setCode(''); setReason(''); setNoCode(false); setError(''); };
  const onTheWay = sent.filter((x) => x.status === 'dispatched');

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      <Pressable onPress={() => navigation.navigate('OfisiShehenaNew', undefined)} accessibilityRole="button" style={[s.btn, { backgroundColor: '#d97706' }]}>
        <Text style={s.btnText}>{SH.labels.newBatch}</Text>
      </Pressable>

      {open.length > 0 && (
        <>
          <Text style={[type.small, s.head]}>{SH.labels.openBatches}</Text>
          {open.map((o) => (
            <View key={o.id} style={s.card}>
              <Text style={type.name}>→ {o.destinationCity}{o.lastMileSuperAgent?.businessName ? ` (${o.lastMileSuperAgent.businessName})` : o.lastMileContactName ? ` (${o.lastMileContactName})` : ''}</Text>
              <Text style={type.meta}>Vifurushi {o.totalParcels || 0}</Text>
              <View style={s.row}>
                <Pressable onPress={() => navigation.navigate('OfisiShehenaNew', { shipmentId: o.id, destinationCity: o.destinationCity || '', lastMileName: o.lastMileSuperAgent?.businessName || o.lastMileContactName || '', step: 'add' })}
                  accessibilityRole="button" style={[s.btn, s.half, s.ghost]}>
                  <Text style={[s.btnText, { color: '#d97706' }]}>{SH.labels.addParcels}</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('OfisiShehenaNew', { shipmentId: o.id, destinationCity: o.destinationCity || '', lastMileName: o.lastMileSuperAgent?.businessName || o.lastMileContactName || '', step: 'dispatch' })}
                  accessibilityRole="button" style={[s.btn, s.half, { backgroundColor: GREEN }]}>
                  <Text style={s.btnText}>{SH.labels.finish}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={[type.small, s.head]}>{SH.labels.incoming} ({incoming.length})</Text>
      {done ? <Text style={[type.meta, { color: GREEN, fontWeight: '700' }]}>{done}</Text> : null}
      {incoming.length === 0 && !done && <Text style={s.empty}>Hakuna shehena inayokuja sasa hivi.</Text>}
      {incoming.map((r) => (
        <View key={r.id} style={s.card}>
          <Text style={type.name}>Kutoka {r.fromOffice || r.originCity} · vifurushi {r.totalParcels}</Text>
          <Text style={type.meta}>{[r.transportCompany && `Usafiri: ${r.transportCompany}`, r.transportRef && `Rejea: ${r.transportRef}`, r.fromPhone && `Simu: ${r.fromPhone}`].filter(Boolean).join(' · ')}</Text>
          {openId !== r.id ? (
            <Pressable onPress={() => startReceive(r.id)} accessibilityRole="button" style={[s.btn, { backgroundColor: colors.ink }]}>
              <Text style={s.btnText}>Pokea shehena</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              {!noCode ? (
                <TextInput value={code} onChangeText={(v) => setCode(digits(v))} keyboardType="number-pad"
                  placeholder={SH.labels.handoverHint} placeholderTextColor={colors.muted} style={s.input} />
              ) : (
                <TextInput value={reason} onChangeText={(v) => setReason(v.slice(0, SH.receiveReasonMaxLength))}
                  placeholder="Kwa nini huna namba? (mf. lebo imepotea)" placeholderTextColor={colors.muted} style={s.input} />
              )}
              <View style={s.row}>
                <Pressable onPress={() => receive(r)} disabled={busy || !canReceive} accessibilityRole="button"
                  style={[s.btn, s.half, { backgroundColor: colors.ink }, (busy || !canReceive) && { opacity: 0.5 }]}>
                  <Text style={s.btnText}>{SH.labels.receiveAll} {r.totalParcels}</Text>
                </Pressable>
                <Pressable onPress={() => { setNoCode((v) => !v); setError(''); }} accessibilityRole="button" style={[s.btn, s.half, s.ghost]}>
                  <Text style={[s.btnText, { color: '#2563eb' }]}>{noCode ? SH.labels.hasCode : SH.labels.noCode}</Text>
                </Pressable>
              </View>
              {error ? <Text style={[type.meta, { color: '#b91c1c' }]}>{error}</Text> : null}
            </View>
          )}
        </View>
      ))}

      <Text style={[type.small, s.head]}>{SH.labels.sent} ({onTheWay.length})</Text>
      {onTheWay.length === 0 && <Text style={s.empty}>Hakuna shehena iliyo njiani.</Text>}
      {onTheWay.map((x) => (
        <View key={x.id} style={s.card}>
          <Text style={type.name}>Kwenda {x.destinationCity} · vifurushi {x.totalParcels}</Text>
          <Text style={type.meta}>{SH.labels.handoverHint}</Text>
          <Text style={[type.name, { letterSpacing: 3, fontSize: 22 }]}>{x.handoverCode}</Text>
          <Text style={[type.meta, x.transportConfirmedAt ? { color: GREEN } : null]}>
            {x.transportConfirmedAt ? 'Usafiri umethibitisha kupokea' : (x.transportCompany ? `Usafiri: ${x.transportCompany}` : 'Usafiri bado haujathibitisha')}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 8, backgroundColor: '#fff' },
  head: { marginTop: 16, fontWeight: '800', color: colors.ink },
  empty: { color: colors.muted, fontSize: 13, padding: 12, borderRadius: 12, backgroundColor: colors.soft },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 6, backgroundColor: '#fff' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
  btn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  ghost: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
