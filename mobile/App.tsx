import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';
import { Button } from './src/components/Ui';
import { api } from './src/api/client';
import { VERSION_CODE } from './src/config';
import { colors } from './src/theme';

/** KenteXa app (#422). Start: who is signed in, then the version rule, then the app. */
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#ffffff', primary: colors.ink, border: colors.line, card: '#ffffff', text: colors.ink } };

function Gate() {
  const { ready } = useAuth();
  const [update, setUpdate] = useState<{ url: string } | null>(null);

  useEffect(() => {
    api.get('/version/app').then((v: any) => {
      if (VERSION_CODE && Number(v?.minVersionCode) > VERSION_CODE && v?.androidUrl) setUpdate({ url: v.androidUrl });
    }).catch(() => {});
  }, []);

  if (update) {
    return (
      <View style={s.center}>
        <Text style={s.title}>Sasisha KenteXa</Text>
        <Text style={s.text}>Toleo hili la app ni la zamani. Sasisha kupata huduma mpya.</Text>
        <Button title="Sasisha sasa" onPress={() => Linking.openURL(update.url)} />
      </View>
    );
  }
  if (!ready) return <View style={s.center}><Text style={s.brand}>Kente<Text style={{ color: colors.brand }}>Xa</Text></Text></View>;
  return (
    <NavigationContainer linking={linking} theme={theme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#fff' },
  brand: { fontSize: 32, fontWeight: '900', color: colors.ink },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  text: { fontSize: 15, color: colors.muted, textAlign: 'center' },
});
