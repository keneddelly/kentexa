import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Empty } from '../components/Ui';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams, 'OfisiSettings'>;

const GREEN = '#15803d';

interface Profile {
  businessName?: string | null;
  city?: string | null;
  agentCode?: string | null;
  status?: string | null;
  hubLocationComplete?: boolean;
  hubLocationPrompt?: { message?: string } | null;
}

const STATUS_SW: Record<string, string> = {
  active: 'Imewashwa',
  pending: 'Inasubiri kukubaliwa',
  suspended: 'Imesimamishwa',
  rejected: 'Imekataliwa',
};

/**
 * Mipangilio ya ofisi, read-only in the Ofisi app (MVP). Shows the office's details from the server
 * (GET /super-agents/my-profile). Changing them stays on the web until the native forms are built.
 */
export default function OfisiSettingsScreen(_: P) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  if (!profile && error) return <Empty title="Mipangilio ya ofisi" text={error} />;
  if (!profile) return <View style={s.wrap} />;

  return (
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}>
      <Field label="Jina la ofisi" value={profile.businessName || '—'} />
      <Field label="Mji" value={profile.city || '—'} />
      <Field label="Namba ya ofisi" value={profile.agentCode || '—'} />
      <Field label="Hali" value={(profile.status && STATUS_SW[profile.status]) || profile.status || '—'} />

      {profile.hubLocationComplete === false && (
        <View style={s.notice}>
          <Text style={type.name}>Eneo halisi halijawekwa</Text>
          <Text style={type.meta}>{profile.hubLocationPrompt?.message || 'Weka eneo halisi la ofisi kwenye KenteXa kwa kompyuta.'}</Text>
        </View>
      )}

      <Text style={[type.small, s.foot]}>Kubadilisha taarifa hizi, tumia KenteXa kwenye kivinjari.</Text>
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

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16, gap: 4, backgroundColor: '#fff' },
  field: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 2 },
  value: { fontFamily: F.bold, fontSize: 16, color: colors.ink },
  notice: { marginTop: 16, borderRadius: 12, backgroundColor: colors.soft, padding: 14, gap: 4 },
  foot: { marginTop: 16 },
});
