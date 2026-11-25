import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Empty } from '../components/Ui';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';
import { OFFICE_RULES } from '../office/officeRules';

type P = NativeStackScreenProps<RootStackParams, 'OfisiSettings'>;

const GREEN = '#15803d';

interface Profile {
  businessName?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  agentCode?: string | null;
  status?: string | null;
  hubLocationComplete?: boolean;
  hubLocationPrompt?: { message?: string } | null;
}

/** A place from GET /location-intelligence/places (the same candidates the web picker shows). */
interface Place {
  displayLabel: string;
  placeRef?: { providerPlaceId?: string; providerKey?: string } | null;
}

const STATUS_SW: Record<string, string> = {
  active: 'Imewashwa',
  pending: 'Inasubiri kukubaliwa',
  suspended: 'Imesimamishwa',
  rejected: 'Imekataliwa',
};

type Form = { businessName: string; phone: string; address: string };

/**
 * Mipangilio ya ofisi. Same fields as the web settings page (SuperAgentSettings.js):
 * name, phone, address and the hub location (a Kentexa place). Saves through the same endpoints.
 */
export default function OfisiSettingsScreen(_: P) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>({ businessName: '', phone: '', address: '' });
  const [placeText, setPlaceText] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProfile(await api.get<Profile>('/super-agents/my-profile'));
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kupakia. Jaribu tena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    setForm({
      businessName: profile?.businessName || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
    });
    setPlaceText(profile?.city || '');
    setPicked(null);
    setPlaces([]);
    setSaveMsg('');
    setEditing(true);
  };

  // Place search, same rules as the web picker (debounced).
  useEffect(() => {
    const q = placeText.trim();
    if (!editing || q.length < 2 || (picked && q === picked.displayLabel)) { setPlaces([]); return; }
    const t = setTimeout(async () => {
      try {
        const r: any = await api.get(`/location-intelligence/places?q=${encodeURIComponent(q)}&limit=8`);
        setPlaces(Array.isArray(r?.candidates) ? r.candidates : []);
      } catch { setPlaces([]); }
    }, 220);
    return () => clearTimeout(t);
  }, [placeText, picked, editing]);

  const save = async () => {
    if (!form.businessName.trim()) { setSaveMsg('Weka jina la ofisi.'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      await api.patch('/super-agents/my-profile', {
        businessName: form.businessName,
        phone: form.phone,
        address: form.address,
      });
      if (picked?.placeRef?.providerKey && picked.placeRef.providerPlaceId) {
        await api.patch('/super-agents/my-profile/location', {
          providerKey: picked.placeRef.providerKey,
          providerPlaceId: picked.placeRef.providerPlaceId,
          addressDetail: form.address,
        });
      }
      setEditing(false);
      await load();
    } catch (e: any) {
      setSaveMsg(e?.message || 'Imeshindikana kuhifadhi. Jaribu tena.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile && error) return <Empty title="Mipangilio ya ofisi" text={error} />;
  if (!profile) return <View style={s.wrap} />;

  if (editing) {
    return (
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Input label="Jina la ofisi" value={form.businessName} onChangeText={(v) => setForm({ ...form, businessName: v })} />
        <Input label="Namba ya simu" value={form.phone} keyboardType="phone-pad" onChangeText={(v) => setForm({ ...form, phone: v })} />
        <Input label="Maelezo ya eneo / landmark" value={form.address} placeholder="Mfano: karibu na soko, jengo la pili" onChangeText={(v) => setForm({ ...form, address: v })} />

        <Text style={type.small}>Eneo la ofisi</Text>
        <TextInput
          value={placeText}
          onChangeText={(v) => { setPlaceText(v); setPicked(null); }}
          placeholder="Tafuta eneo, ward au district…"
          placeholderTextColor={colors.muted}
          style={s.input}
        />
        {picked && <Text style={[type.meta, { color: GREEN }]}>Eneo jipya: {picked.displayLabel}</Text>}
        {places.map((p, i) => (
          <Pressable key={`${p.placeRef?.providerPlaceId || i}`} onPress={() => { setPicked(p); setPlaceText(p.displayLabel); setPlaces([]); }}
            accessibilityRole="button" style={s.place}>
            <Text style={type.name}>{p.displayLabel}</Text>
          </Pressable>
        ))}

        {saveMsg ? <Text style={[type.meta, { color: '#b91c1c' }]}>{saveMsg}</Text> : null}
        <View style={s.row}>
          <Pressable onPress={() => setEditing(false)} disabled={saving} accessibilityRole="button" style={[s.btn, s.btnGhost]}>
            <Text style={[s.btnText, { color: colors.ink }]}>Ghairi</Text>
          </Pressable>
          <Pressable onPress={save} disabled={saving} accessibilityRole="button" style={[s.btn, { backgroundColor: GREEN }]}>
            <Text style={[s.btnText, { color: '#fff' }]}>{saving ? 'Inahifadhi…' : 'Hifadhi'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      <Field label="Jina la ofisi" value={profile.businessName || '—'} />
      <Field label="Namba ya simu" value={profile.phone || '—'} />
      <Field label="Maelezo ya eneo" value={profile.address || '—'} />
      <Field label="Mji" value={profile.city || '—'} />
      <Field label="Namba ya ofisi" value={profile.agentCode || '—'} />
      <Field label="Hali" value={(profile.status && STATUS_SW[profile.status]) || profile.status || '—'} />

      {profile.hubLocationComplete === false && (
        <View style={s.notice}>
          <Text style={type.name}>Eneo halisi halijawekwa</Text>
          <Text style={type.meta}>{profile.hubLocationPrompt?.message || 'Tafuta eneo la ofisi yako hapa chini.'}</Text>
        </View>
      )}

      <Pressable onPress={startEdit} accessibilityRole="button" style={[s.btn, { backgroundColor: GREEN, marginTop: 16 }]}>
        <Text style={[s.btnText, { color: '#fff' }]}>Hariri</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={type.small}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function Input({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: 'phone-pad' | 'default';
}) {
  return (
    <View style={{ gap: 6, marginBottom: 10 }}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType || 'default'}
        placeholderTextColor={colors.muted} style={s.input} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16, gap: 4, backgroundColor: '#fff' },
  field: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 2 },
  value: { fontFamily: F.bold, fontSize: 16, color: colors.ink },
  notice: { marginTop: 16, borderRadius: 12, backgroundColor: colors.soft, padding: 14, gap: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
  place: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  btnText: { fontFamily: F.bold, fontSize: 15 },
});
