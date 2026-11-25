import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../api/client';
import { colors, type } from '../theme';
import { OFFICE_RULES } from '../office/officeRules';

/**
 * "Weka mahali pa ofisi": the office's exact map point from the phone's GPS, taken once at the office.
 * The server checks it (inside Tanzania, accuracy within its limit) and returns its message.
 * Same endpoint and wording as the web (OfficePoint.js).
 */
const OP = OFFICE_RULES.officePoint;
const GREEN = '#15803d';
const AMBER = '#d97706';

type ErrCode = keyof typeof OP.errorTexts;

/** Takes the phone's GPS and saves it as the office point. Returns the text to show. */
export async function saveOfficePointFromGps(): Promise<{ ok: boolean; text: string }> {
  // Location failures use the web's wording; only the server's own message is shown as-is.
  let pos: Location.LocationObject;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('denied');
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch (e: any) {
    const code: ErrCode = e?.message === 'denied' ? 'denied' : 'unavailable';
    return { ok: false, text: OP.errorTexts[code] };
  }
  try {
    const accuracy = pos.coords.accuracy == null ? null : Math.round(pos.coords.accuracy);
    const res: any = await api.patch(OP.endpoint.split(' ')[1], {
      latitude: Math.round(pos.coords.latitude * 1e6) / 1e6,
      longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
      accuracyM: accuracy,
    });
    return { ok: true, text: res?.message || OP.texts.saved };
  } catch (e: any) {
    return { ok: false, text: e?.message || OP.errorTexts.unavailable };
  }
}

export default function OfisiOfficePoint({ byGps, set, onSaved }: { byGps?: boolean | null; set?: boolean | null; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const capture = async () => {
    setBusy(true);
    setMessage(null);
    const r = await saveOfficePointFromGps();
    setMessage(r);
    if (r.ok) onSaved();
    setBusy(false);
  };

  const note = message ? <Text style={[type.meta, { color: message.ok ? GREEN : '#b91c1c' }]}>{message.text}</Text> : null;

  if (byGps) {
    return (
      <View style={s.line}>
        <Text style={type.meta}>{OP.texts.setGps}</Text>
        <Pressable onPress={capture} disabled={busy} accessibilityRole="button">
          <Text style={[type.name, { color: '#2563eb' }]}>{busy ? '…' : OP.texts.change}</Text>
        </Pressable>
        {note}
      </View>
    );
  }

  return (
    <View style={s.box}>
      <Text style={[type.name, { color: '#92400e' }]}>{OP.texts.title}</Text>
      <Text style={type.meta}>{set ? OP.texts.onlyPlace : OP.texts.explain}</Text>
      <Pressable onPress={capture} disabled={busy} accessibilityRole="button" style={[s.btn, { backgroundColor: AMBER }, busy && { opacity: 0.5 }]}>
        <Text style={s.btnText}>{busy ? OP.texts.locating : OP.texts.button}</Text>
      </Pressable>
      {note}
    </View>
  );
}

const s = StyleSheet.create({
  line: { marginTop: 12, gap: 4 },
  box: { marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', padding: 14, gap: 8 },
  btn: { height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
