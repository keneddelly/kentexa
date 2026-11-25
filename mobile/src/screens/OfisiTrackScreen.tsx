import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiTrack'>;
const GREEN = '#15803d';
const R = OFFICE_RULES.partners.endpoints;
const RS = R;
const label = (status: string) => (OFFICE_RULES.statusLabels as Record<string, string>)[status] || status;
const money = (n: unknown) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
const path = (ep: string, tn: string) => ep.split(' ')[1].replace(':trackingNumber', encodeURIComponent(tn));

interface Track {
  senderName?: string; senderPhone?: string; recipientName?: string; deliveryAddress?: string; description?: string;
  originCity?: string; transitCity?: string; destinationCity?: string;
  originAgent?: string; destinationAgent?: string; destinationAgentPhone?: string;
  history?: Array<{ status: string; note?: string; updatedBy?: string; handlerPhone?: string; handlerLocation?: string; createdAt?: string }>;
}
interface Receipt {
  parcelReference?: string;
  originCity?: string; destinationCity?: string;
  receipt?: { receiptNumber?: string; senderName?: string; senderPhone?: string; receiverName?: string; receiverPhone?: string; declaredValue?: number; amountPaid?: number; paidAt?: string };
}

/**
 * Fuatilia mzigo: the parcel's history, its receipt, and resending the SMS, the same calls the web
 * office page makes from its history and receipt views. Nothing here creates or charges anything.
 */
export default function OfisiTrackScreen({ route }: P) {
  const initial = (route.params as { trackingNumber?: string } | undefined)?.trackingNumber || '';
  const [tn, setTn] = useState(initial);
  const [track, setTrack] = useState<Track | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const search = async () => {
    const q = tn.trim();
    if (!q) return;
    setBusy('track'); setError(''); setNotice(''); setReceipt(null);
    try {
      setTrack(await api.get<Track>(path(R.track, q)));
    } catch (e: any) {
      setTrack(null);
      setError(e?.message || 'Imeshindwa kupata historia');
    } finally { setBusy(''); }
  };

  const showReceipt = async () => {
    setBusy('receipt'); setError(''); setNotice('');
    try {
      setReceipt(await api.get<Receipt>(path(R.receipt, tn.trim())));
    } catch (e: any) {
      setError(e?.message || 'Imeshindwa kupata risiti');
    } finally { setBusy(''); }
  };

  const resend = async (which: 'sender' | 'receiver') => {
    setBusy(which); setNotice('');
    try {
      const ep = which === 'sender' ? RS.resendSenderSms : RS.resendReceiverSms;
      const res: any = await api.post(path(ep, tn.trim()));
      const sent = which === 'sender' ? res?.senderSmsSent : res?.receiverSmsSent;
      setNotice(sent ? 'SMS imetumwa upya' : 'SMS haikuweza kutumwa');
    } catch (e: any) {
      setNotice(e?.message || 'Imeshindwa kutuma SMS');
    } finally { setBusy(''); }
  };

  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>Fuatilia mzigo</Text>
      <View style={s.search}>
        <TextInput value={tn} onChangeText={setTn} autoCapitalize="characters" placeholder="Namba ya mzigo" style={s.input}
          placeholderTextColor={colors.muted} onSubmitEditing={search} returnKeyType="search" />
        <Pressable onPress={search} disabled={!!busy} accessibilityRole="button" style={[s.btn, !!busy && { opacity: 0.5 }]}>
          <Text style={s.btnText}>{busy === 'track' ? '…' : 'Tafuta'}</Text>
        </Pressable>
      </View>
      {!!error && <Text style={[type.meta, { color: colors.danger }]}>{error}</Text>}
      {!!notice && <Text style={[type.meta, { color: GREEN }]}>{notice}</Text>}

      {track && (
        <>
          <View style={s.card}>
            <Text style={type.name}>{[track.originCity, track.transitCity, track.destinationCity].filter(Boolean).join(' → ')}</Text>
            <Line k="Mtumaji" v={[track.senderName, track.senderPhone].filter(Boolean).join(' · ')} />
            <Line k="Mpokeaji" v={track.recipientName} />
            <Line k="Anwani" v={track.deliveryAddress} />
            <Line k="Bidhaa" v={track.description} />
            <Line k="Ofisi ya kuanzia" v={track.originAgent} />
            <Line k="Ofisi ya kupokea" v={[track.destinationAgent, track.destinationAgentPhone].filter(Boolean).join(' · ')} />
          </View>

          <View style={s.card}>
            <Text style={type.name}>Historia</Text>
            {(track.history || []).map((h, i) => (
              <View key={i} style={s.event}>
                <Text style={[type.name, { fontSize: 14 }]}>{label(h.status)}</Text>
                {!!h.note && <Text style={type.small}>{h.note}</Text>}
                <Text style={type.small}>
                  {[h.updatedBy, h.handlerPhone, h.handlerLocation, h.createdAt ? new Date(h.createdAt).toLocaleString('sw-TZ') : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.two}>
            <Pressable onPress={showReceipt} disabled={!!busy} accessibilityRole="button" style={[s.ghost, { flex: 1 }]}>
              <Text style={s.ghostText}>{busy === 'receipt' ? '…' : 'Ona risiti'}</Text>
            </Pressable>
            <Pressable onPress={() => resend('sender')} disabled={!!busy} accessibilityRole="button" style={[s.ghost, { flex: 1 }]}>
              <Text style={s.ghostText}>{busy === 'sender' ? '…' : 'Tuma tena (mtumaji)'}</Text>
            </Pressable>
            <Pressable onPress={() => resend('receiver')} disabled={!!busy} accessibilityRole="button" style={[s.ghost, { flex: 1 }]}>
              <Text style={s.ghostText}>{busy === 'receiver' ? '…' : 'Tuma tena (mpokeaji)'}</Text>
            </Pressable>
          </View>
        </>
      )}

      {receipt && (
        <View style={s.card}>
          <Text style={type.small}>Namba ya mzigo</Text>
          <Text style={[type.name, { fontSize: 20 }]}>{receipt.parcelReference}</Text>
          <Line k="Namba ya risiti" v={receipt.receipt?.receiptNumber} />
          <Line k="Mtumaji" v={[receipt.receipt?.senderName, receipt.receipt?.senderPhone].filter(Boolean).join(' · ')} />
          <Line k="Mpokeaji" v={[receipt.receipt?.receiverName, receipt.receipt?.receiverPhone].filter(Boolean).join(' · ')} />
          <Line k="Njia" v={[receipt.originCity, receipt.destinationCity].filter(Boolean).join(' → ')} />
          <Line k="Thamani ya mzigo" v={receipt.receipt?.declaredValue != null ? money(receipt.receipt.declaredValue) : undefined} />
          <Line k="Kiasi kilicholipwa" v={receipt.receipt?.amountPaid != null ? money(receipt.receipt.amountPaid) : undefined} />
          <Line k="Imelipwa" v={receipt.receipt?.paidAt ? new Date(receipt.receipt.paidAt).toLocaleString('sw-TZ') : undefined} />
        </View>
      )}
    </ScrollView>
  );
}

function Line({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <View style={s.line}>
      <Text style={type.small}>{k}</Text>
      <Text style={[type.small, { color: colors.ink, fontFamily: F.bold, flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  search: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, fontFamily: F.regular },
  btn: { backgroundColor: GREEN, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  btnText: { color: '#fff', fontFamily: F.bold, fontSize: 15 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  event: { borderLeftWidth: 2, borderLeftColor: colors.line, paddingLeft: 12, paddingVertical: 4, gap: 2 },
  two: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ghost: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  ghostText: { color: colors.ink, fontFamily: F.bold, fontSize: 13 },
});
