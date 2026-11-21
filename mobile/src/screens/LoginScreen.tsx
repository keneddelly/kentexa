import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Ui';
import { F, colors } from '../theme';
import { WEB_URL } from '../config';
import type { RootStackParams } from '../navigation/types';

/** Ingia (#422 N0): phone or email and password. Google and sign-up come natively in N4; until then they open the web page. */
export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParams, 'Login'>) {
  const { signIn } = useAuth();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!id.trim() || !password) { setError('Andika simu au barua pepe na nenosiri.'); return; }
    setBusy(true); setError('');
    try { await signIn(id, password); navigation.goBack(); } catch (e: any) { setError(e?.message || 'Imeshindikana kuingia.'); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>Kente<Text style={{ color: colors.brand }}>Xa</Text></Text>
        <Text style={s.title}>Ingia kwenye KenteXa</Text>
        <TextInput style={s.input} placeholder="Simu au barua pepe" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" textContentType="username" value={id} onChangeText={setId} />
        <TextInput style={s.input} placeholder="Nenosiri" placeholderTextColor={colors.muted} secureTextEntry textContentType="password"
          value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : null}
        <Button title="Ingia" onPress={submit} busy={busy} />
        <View style={s.links}>
          <Pressable onPress={() => navigation.navigate('Web', { url: `${WEB_URL}/p/Register`, title: 'Jisajili' })}><Text style={s.link}>Fungua akaunti</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('Web', { url: `${WEB_URL}/p/PublicLogin`, title: 'Nenosiri' })}><Text style={s.link}>Umesahau nenosiri?</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 24, gap: 14, paddingTop: 40 },
  brand: { fontSize: 30, fontFamily: F.black, color: colors.ink },
  title: { fontSize: 24, fontFamily: F.black, color: colors.ink, marginBottom: 6 },
  input: { height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, fontSize: 16, fontFamily: F.regular, color: colors.ink },
  error: { color: colors.danger, fontSize: 14, fontFamily: F.regular },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  link: { color: colors.brand, fontFamily: F.bold, fontSize: 15 },
});
