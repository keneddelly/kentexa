import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { registerForPush } from '../push/nativePush';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams>;
type Status = { nativeDeviceCount: number; webSubscriptionCount: number; nativeConfigured: boolean; webConfigured: boolean };

export default function NotificationSettingsScreen(_props: P) {
  const [permission, setPermission] = useState('Inajikagua');
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync();
      setPermission(p.status === 'granted' ? 'Imewashwa' : p.status === 'denied' ? 'Imekataliwa' : 'Haijawashwa');
    } catch { setPermission('Haipatikani'); }
    try { setStatus(await api.get<Status>('/notifications/device-status')); } catch { setStatus(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const enable = async () => {
    setBusy(true); setMessage('');
    const result = await registerForPush({ requestPermission: true });
    setMessage(result.message);
    await refresh();
    setBusy(false);
  };

  const test = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await api.post<{ status: string }>('/notifications/push/test', {});
      if (result.status === 'accepted') setMessage('FCM imekubali kutuma jaribio. Hii haithibitishi kuwa simu tayari imelionyesha.');
      else if (result.status === 'no_device') setMessage('Hakuna kifaa kilichosajiliwa. Washa arifa kwanza.');
      else if (result.status === 'not_configured') setMessage('Huduma ya FCM haijasanidiwa kwenye seva.');
      else setMessage('FCM imeshindwa kutuma jaribio. Jaribu tena baadaye.');
    } catch (e: any) { setMessage(e?.message || 'Jaribio limeshindwa.'); }
    await refresh();
    setBusy(false);
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.body}>
      <Text style={type.title}>Arifa za Kentexa</Text>
      <Text style={type.body}>Dhibiti arifa kwenye simu hii. Kuruhusu arifa ni hiari; unaweza kuendelea kutumia Kentexa hata kama umezima arifa.</Text>
      <View style={s.card}>
        <Text style={type.meta}>Ruhusa ya simu</Text><Text style={s.value}>{permission}</Text>
        <Text style={type.meta}>Usajili wa kifaa</Text><Text style={s.value}>{loading ? 'Inakagua…' : status?.nativeDeviceCount ? 'Kimesajiliwa' : 'Hakijasajiliwa'}</Text>
        <Text style={type.meta}>Huduma ya FCM</Text><Text style={s.value}>{status?.nativeConfigured ? 'Inapatikana' : 'Haijathibitishwa'}</Text>
      </View>
      {Platform.OS === 'android' && <Button title="Washa / sasisha usajili wa arifa" onPress={enable} busy={busy} />}
      <Button title="Tuma arifa ya majaribio" onPress={test} dark={false} busy={busy || loading} disabled={!status?.nativeDeviceCount} />
      {message ? <Text style={s.message}>{message}</Text> : null}
      {loading ? <ActivityIndicator color={colors.ink} /> : null}
      <Text style={type.meta}>FCM kukubali ujumbe si uthibitisho wa kuonekana kwenye skrini. Hali ya simu, mtandao na mipangilio ya mfumo inaweza kuathiri uwasilishaji.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' }, body: { padding: 16, gap: 16 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, gap: 8 },
  value: { fontSize: 16, color: colors.ink, fontWeight: '600', marginBottom: 8 },
  message: { fontSize: 14, color: colors.ink, lineHeight: 20 },
});
