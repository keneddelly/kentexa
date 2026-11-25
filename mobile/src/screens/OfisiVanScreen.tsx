import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Empty } from '../components/Ui';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiVan'>;

/**
 * Van Desk for Dar offices: receive parcels brought by a Van, release parcels to a Van, and see the
 * parcels ready for pickup or delivery. Same queues, endpoints, messages and rules as the web tab.
 */
const V = OFFICE_RULES.vanDesk;
const BLUE = '#1d4ed8';
const GREEN = '#16a34a';

interface ToSend { id: number; trackingNumber?: string | null; customerNumber?: string | null; originCity?: string | null; destinationCity?: string | null; weightKg?: number | null }
interface Incoming { assignmentId: number; parcelId: number; trackingNumber?: string | null; runId: number; waitingMinutes?: number | null }
interface AtOffice { id: number; trackingNumber?: string | null; customerNumber?: string | null; status?: string | null }
interface Run { runId: number; transportProviderId: number; loadRunStopId: number; loadLabel?: string | null; unloadLabel?: string | null; scheduledDeparture?: string | null }

const path = (ep: string) => ep.split(' ')[1];
const numberOf = (p: { customerNumber?: string | null; trackingNumber?: string | null; id?: number; parcelId?: number }) =>
  p.customerNumber || p.trackingNumber || `Parcel #${p.id ?? p.parcelId}`;

export default function OfisiVanScreen(_: P) {
  const [isDar, setIsDar] = useState<boolean | null>(null);
  const [toSend, setToSend] = useState<ToSend[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [atOffice, setAtOffice] = useState<AtOffice[]>([]);
  const [runs, setRuns] = useState<Record<number, Run[]>>({});
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prof, blocked, awaiting, ready] = await Promise.all([
        api.get<{ city?: string | null }>('/super-agents/my-profile'),
        api.get<Incoming[]>(path(V.endpoints.blockedReceipts)).catch(() => []),
        api.get<AtOffice[]>(path(V.endpoints.awaitingCompletion)).catch(() => []),
        api.get<ToSend[]>(path(V.endpoints.readyForMovement)).catch(() => []),
      ]);
      setIsDar(String(prof?.city || '').toLowerCase().includes(V.cityMatch));
      setIncoming(Array.isArray(blocked) ? blocked : []);
      setAtOffice(Array.isArray(awaiting) ? awaiting : []);
      setToSend(Array.isArray(ready) ? ready : []);
    } catch (e: any) {
      setError(e?.message || V.messages.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const findRuns = async (parcelId: number) => {
    setError('');
    try {
      const list = await api.get<Run[]>(path(V.endpoints.eligibleRuns).replace(':parcelId', String(parcelId)));
      const arr = Array.isArray(list) ? list : [];
      setRuns((r) => ({ ...r, [parcelId]: arr }));
      if (!arr.length) setError(V.messages.noRuns);
    } catch (e: any) {
      setError(e?.message || V.messages.noRuns);
    }
  };

  const release = async (p: ToSend) => {
    const run = (runs[p.id] || []).find((x) => Number(x.runId) === Number(chosen[p.id]));
    if (!run) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(path(V.endpoints.tender), {
        parcelId: p.id,
        transportProviderId: Number(run.transportProviderId),
        runId: Number(run.runId),
        loadRunStopId: Number(run.loadRunStopId),
        idempotencyKey: `hub-release:${p.id}:run:${run.runId}:stop:${run.loadRunStopId}`,
      });
      setNotice(V.messages.tendered);
      await load();
    } catch (e: any) {
      setError(e?.message || V.messages.tenderFailed);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (row: Incoming) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.patch(path(V.endpoints.confirmReceipt).replace(':assignmentId', String(row.assignmentId)));
      setNotice(V.messages.received);
      await load();
    } catch (e: any) {
      setError(e?.message || V.messages.receiptFailed);
    } finally {
      setBusy(false);
    }
  };

  if (isDar === false) return <Empty title={V.title} text="Van Desk ni kwa ofisi za Dar es Salaam." />;
  if (isDar === null && error) return <Empty title={V.title} text={error} />;

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      <Text style={type.title}>{V.title}</Text>
      <Text style={type.meta}>{V.subtitle}</Text>

      {error ? <Text style={[type.meta, { color: '#b91c1c' }]}>{error}</Text> : null}
      {notice ? <Text style={[type.meta, { color: GREEN, fontWeight: '700' }]}>{notice}</Text> : null}

      <Text style={[type.small, s.head, { color: BLUE }]}>{V.queues.readyToSend} · {toSend.length}</Text>
      {toSend.length === 0 && <Text style={s.empty}>{V.emptyMessages.readyToSend}</Text>}
      {toSend.map((p) => {
        const list = runs[p.id] || [];
        return (
          <View key={p.id} style={s.card}>
            <Text style={type.name}>{numberOf(p)}</Text>
            <Text style={type.meta}>{p.originCity} → {p.destinationCity}{p.weightKg ? ` · ${p.weightKg}kg` : ''}</Text>
            {list.length === 0 ? (
              <Button label={V.buttons.findRun} color={colors.ink} onPress={() => findRuns(p.id)} disabled={busy} />
            ) : (
              <>
                {list.map((x) => {
                  const on = Number(chosen[p.id]) === Number(x.runId);
                  return (
                    <Pressable key={x.runId} onPress={() => setChosen((c) => ({ ...c, [p.id]: x.runId }))} accessibilityRole="radio"
                      accessibilityState={{ selected: on }} style={[s.run, on && s.runOn]}>
                      <Text style={type.name}>{x.loadLabel} → {x.unloadLabel}</Text>
                      <Text style={type.meta}>{x.scheduledDeparture ? new Date(x.scheduledDeparture).toLocaleString() : ''}</Text>
                    </Pressable>
                  );
                })}
                <Button label={V.buttons.release} color={BLUE} onPress={() => release(p)} disabled={busy || !chosen[p.id]} />
              </>
            )}
          </View>
        );
      })}

      <Text style={[type.small, s.head]}>{V.queues.incoming} · {incoming.length}</Text>
      {incoming.length === 0 && <Text style={s.empty}>{V.emptyMessages.incoming}</Text>}
      {incoming.map((row) => (
        <View key={row.assignmentId} style={s.card}>
          <Text style={type.name}>{row.trackingNumber || `Parcel #${row.parcelId}`}</Text>
          <Text style={type.meta}>Run #{row.runId} · Imeshushwa {Math.max(0, Math.round(Number(row.waitingMinutes || 0)))} dk zilizopita</Text>
          <Button label={V.buttons.received} color={GREEN} onPress={() => confirm(row)} disabled={busy} />
        </View>
      ))}

      <Text style={[type.small, s.head, { color: BLUE }]}>{V.queues.atOffice} · {atOffice.length}</Text>
      {atOffice.length === 0 && <Text style={s.empty}>{V.emptyMessages.atOffice}</Text>}
      {atOffice.map((p) => (
        <View key={p.id} style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={type.name}>{numberOf(p)}</Text>
            <Text style={type.meta}>Tayari kwa pickup au Agent delivery</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function Button({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={[s.btn, { backgroundColor: color }, disabled && { opacity: 0.5 }]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 8, backgroundColor: '#fff' },
  head: { marginTop: 16, fontWeight: '800', color: colors.ink },
  empty: { color: colors.muted, fontSize: 13, padding: 12, borderRadius: 12, backgroundColor: colors.soft },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 6, backgroundColor: '#fff' },
  run: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, gap: 2, marginTop: 6 },
  runOn: { borderWidth: 2, borderColor: BLUE, backgroundColor: '#eff6ff' },
  btn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
