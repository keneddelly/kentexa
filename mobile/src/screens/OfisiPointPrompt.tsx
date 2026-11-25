import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';
import { colors, type } from '../theme';
import { OFFICE_RULES } from '../office/officeRules';
import { saveOfficePointFromGps } from './OfisiOfficePoint';

/**
 * Asked only once the office is open (native only): "Weka sasa" sets the map point now from the
 * phone's GPS; "Baadaye" hides it for a day. Shown only while the office has no GPS point.
 */
const PR = OFFICE_RULES.officePoint.prompt;
const KEY = 'ofisi.pointLaterAt';
const DAY_MS = PR.laterDays * 24 * 60 * 60 * 1000;

export default function OfisiPointPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const profile: any = await api.get('/super-agents/my-profile');
        if (profile?.officePointByGps) return;
        const laterAt = Number(await SecureStore.getItemAsync(KEY).catch(() => null));
        if (laterAt && Date.now() - laterAt < DAY_MS) return;
        if (alive) setShow(true);
      } catch {
        // Profile not loaded: say nothing.
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  const now = async () => {
    setBusy(true);
    setMessage('');
    const r = await saveOfficePointFromGps();
    if (r.ok) setShow(false);
    else setMessage(r.text);
    setBusy(false);
  };

  const later = async () => {
    await SecureStore.setItemAsync(KEY, String(Date.now())).catch(() => undefined);
    setShow(false);
  };

  return (
    <View style={s.box}>
      <Text style={[type.name, { color: '#92400e' }]}>{PR.title}</Text>
      <Text style={type.meta}>{PR.explain}</Text>
      <View style={s.row}>
        <Pressable onPress={later} disabled={busy} accessibilityRole="button" style={[s.btn, s.ghost]}>
          <Text style={[s.btnText, { color: colors.ink }]}>{PR.later}</Text>
        </Pressable>
        <Pressable onPress={now} disabled={busy} accessibilityRole="button" style={[s.btn, { backgroundColor: '#d97706' }, busy && { opacity: 0.5 }]}>
          <Text style={s.btnText}>{busy ? '…' : PR.now}</Text>
        </Pressable>
      </View>
      {message ? <Text style={[type.meta, { color: '#b91c1c' }]}>{message}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', padding: 14, gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
