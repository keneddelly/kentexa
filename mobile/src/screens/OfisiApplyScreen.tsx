import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { WEB_URL } from '../config';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiApply'>;

/**
 * Omba kuwa ofisi: the office details and the status, native. The account's ID step is sent to the
 * web for now (the native app does not capture IDs yet). Same endpoints and wording as the web
 * (BecomeSuperAgentInfo.js).
 */
const AP = OFFICE_RULES.apply;
const GREEN = '#15803d';
const BLUE = '#1d4ed8';

interface Identity { status?: string | null; rejectionReason?: string | null }
interface Profile { status?: string | null; agentCode?: string | null; city?: string | null; rejectionReason?: string | null }
interface Place { displayLabel: string; regionName?: string | null; placeRef?: { providerPlaceId?: string; providerKey?: string } | null }

/** Same rule as web utils/identityState.js: 'missing' and 'rejected' need the ID step. */
const identityState = (i: Identity | null): string | null => {
  if (!i) return null;
  if (i.status === 'verified') return 'verified';
  if (i.status === 'pending') return 'waiting';
  if (i.status === 'rejected') return 'rejected';
  return 'missing';
};

export default function OfisiApplyScreen({ navigation }: P) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [placeText, setPlaceText] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [landmark, setLandmark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Identity>(AP.endpoints.identity.split(' ')[1]).catch(() => ({ status: 'missing' } as Identity)),
      api.get<Profile>(AP.endpoints.profile.split(' ')[1]).catch(() => null),
    ]).then(([i, p]) => {
      setIdentity(i);
      setProfile(p && (p as Profile).status ? (p as Profile) : null);
      setReady(true);
    });
  }, []);

  // Place search, same rules as the web picker (debounced).
  useEffect(() => {
    const q = placeText.trim();
    if (q.length < 2 || (place && q === place.displayLabel)) { setPlaces([]); return; }
    const t = setTimeout(async () => {
      try {
        const r: any = await api.get(`/location-intelligence/places?q=${encodeURIComponent(q)}&limit=8`);
        setPlaces(Array.isArray(r?.candidates) ? r.candidates : []);
      } catch { setPlaces([]); }
    }, 220);
    return () => clearTimeout(t);
  }, [placeText, place]);

  const openWeb = () => navigation.navigate('Web', { url: `${WEB_URL}${AP.identityWebPath}`, title: AP.labels.heroTitle });

  const submit = async () => {
    if (!name.trim()) { setError(AP.messages.nameRequired); return; }
    if (!place?.placeRef?.providerKey || !place.placeRef.providerPlaceId) { setError(AP.messages.placeRequired); return; }
    setBusy(true);
    setError('');
    try {
      await api.post(AP.endpoints.apply.split(' ')[1], {
        businessName: name.trim().slice(0, AP.businessNameMax),
        address: landmark.trim().slice(0, AP.addressMax),
        place: { providerKey: place.placeRef.providerKey, providerPlaceId: place.placeRef.providerPlaceId },
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.message || AP.messages.submitFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <View style={s.wrap} />;

  const idState = identityState(identity);
  const needsId = idState === 'missing' || idState === 'rejected';
  const statusTitle = profile?.status ? (AP.statusTitles as Record<string, string>)[profile.status] : undefined;

  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>{AP.labels.heroTitle}</Text>
      <Text style={type.meta}>{AP.labels.heroDesc}</Text>

      {done && (
        <Note tone={GREEN} title={AP.messages.done} text={AP.messages.doneDesc} />
      )}

      {!done && profile && statusTitle && (
        <Note tone={profile.status === 'active' ? GREEN : colors.muted}
          title={statusTitle}
          text={profile.status === 'pending' ? AP.statusPendingDesc
            : profile.status === 'active' ? `Msimbo wako: ${profile.agentCode || '—'} · Mji: ${profile.city || '—'}`
            : (profile.rejectionReason || AP.statusDefaultDesc)} />
      )}

      {!done && !profile && needsId && (
        <View style={s.card}>
          <Text style={type.name}>{idState === 'rejected' ? 'Kitambulisho chako kilikataliwa. Kituma tena.' : AP.messages.identityNeeded}</Text>
          <Pressable onPress={openWeb} accessibilityRole="button" style={[s.btn, { backgroundColor: colors.ink }]}>
            <Text style={s.btnText}>{AP.labels.identityButton}</Text>
          </Pressable>
        </View>
      )}

      {!done && !profile && !needsId && (
        <View style={{ gap: 10 }}>
          {idState === 'waiting' && (
            <Note tone={colors.muted} title="Kitambulisho kinasubiri uthibitisho" text={AP.messages.identityWaiting} />
          )}
          <Text style={type.small}>{AP.labels.businessName}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="mf. Geita Express Hub" placeholderTextColor={colors.muted} style={s.input} />

          <Text style={type.small}>{AP.labels.placeLabel}</Text>
          <TextInput value={placeText} onChangeText={(v) => { setPlaceText(v); setPlace(null); }} placeholder={AP.labels.placePlaceholder}
            placeholderTextColor={colors.muted} style={s.input} />
          {places.map((p, i) => (
            <Pressable key={`${p.placeRef?.providerPlaceId || i}`} onPress={() => { setPlace(p); setPlaceText(p.displayLabel); setPlaces([]); }}
              accessibilityRole="button" style={s.place}>
              <Text style={type.name}>{p.displayLabel}</Text>
            </Pressable>
          ))}
          {place?.regionName ? <Text style={[type.meta, { color: GREEN }]}>{place.regionName}</Text> : null}

          <Text style={type.small}>{AP.labels.landmark}</Text>
          <TextInput value={landmark} onChangeText={setLandmark} placeholder={AP.labels.landmark} placeholderTextColor={colors.muted} style={[s.input, { minHeight: 64 }]} multiline />

          {user?.phone ? <Text style={type.meta}>{AP.messages.phoneFromAccount.replace('{phone}', String(user.phone))}</Text> : null}
          {error ? <Text style={[type.meta, { color: '#b91c1c' }]}>{error}</Text> : null}

          <Pressable onPress={submit} disabled={busy} accessibilityRole="button" style={[s.btn, { backgroundColor: BLUE }, busy && { opacity: 0.5 }]}>
            <Text style={s.btnText}>{busy ? AP.labels.submitting : AP.labels.submit}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function Note({ tone, title, text }: { tone: string; title: string; text: string }) {
  return (
    <View style={[s.card, { borderColor: tone }]}>
      <Text style={[type.name, { color: tone }]}>{title}</Text>
      <Text style={type.meta}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16, gap: 12, backgroundColor: '#fff' },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 8, backgroundColor: '#fff' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
  place: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10 },
  btn: { height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
