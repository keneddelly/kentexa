import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { EngagementProvider } from './src/api/engagement';
import RootNavigator from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';
import { Button } from './src/components/Ui';
import { api } from './src/api/client';
import { VERSION_CODE, WEB_URL } from './src/config';
import { F, colors } from './src/theme';
import type { RootStackParams } from './src/navigation/types';

const navigationRef = createNavigationContainerRef<RootStackParams>();
let pendingNotificationDestination: unknown = null;
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#ffffff', primary: colors.ink, border: colors.line, card: '#ffffff', text: colors.ink } };

function openNotificationDestination(raw: unknown) {
  if (typeof raw !== 'string') return;
  if (!navigationRef.isReady()) { pendingNotificationDestination = raw; return; }
  pendingNotificationDestination = null;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path === '/inbox' || path.startsWith('/inbox?')) {
    navigationRef.navigate('Tabs', { screen: 'Inbox' });
    return;
  }
  const post = path.match(/^\/post\/(\d+)(?:[?#].*)?$/);
  if (post) {
    navigationRef.navigate('Post', { id: Number(post[1]) });
    return;
  }
  navigationRef.navigate('Web', { url: `${WEB_URL}${path}`, title: 'KenteXa' });
}

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
    <NavigationContainer ref={navigationRef} linking={linking} theme={theme} onReady={() => {
      if (pendingNotificationDestination) openNotificationDestination(pendingNotificationDestination);
      else Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) openNotificationDestination(response.notification.request.content.data?.url);
      }).catch(() => {});
    }}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsReady] = useFonts({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.otf'),
    'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.otf'),
    'Inter-Bold': require('./assets/fonts/Inter-Bold.otf'),
    'Inter-ExtraBold': require('./assets/fonts/Inter-ExtraBold.otf'),
  });

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const destination = response.notification.request.content.data?.url;
      openNotificationDestination(destination);
    });
    return () => subscription.remove();
  }, []);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <EngagementProvider>
          <Gate />
        </EngagementProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#fff' },
  brand: { fontSize: 32, fontFamily: F.black, color: colors.ink },
  title: { fontSize: 22, fontFamily: F.black, color: colors.ink },
  text: { fontSize: 15, fontFamily: F.regular, color: colors.muted, textAlign: 'center' },
});
