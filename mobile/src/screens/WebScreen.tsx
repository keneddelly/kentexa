import React, { useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme';
import type { RootStackParams } from '../navigation/types';

/**
 * A kentexa.com page inside the app (#422): for the parts that are not native yet (seller tools,
 * ofisi, shipping forms). Android back goes back inside the page first, then leaves the screen.
 * Signed-in web inside the app comes in N4.
 */
export default function WebScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'Web'>) {
  const ref = useRef<WebView>(null);
  const [canBack, setCanBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = route.params.url.includes('?') ? `${route.params.url}&source=app` : `${route.params.url}?source=app`;

  useFocusEffect(React.useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBack) { ref.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canBack]));

  React.useEffect(() => { if (route.params.title) navigation.setOptions({ title: route.params.title }); }, [navigation, route.params.title]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <WebView ref={ref} source={{ uri: url }} onNavigationStateChange={(n) => setCanBack(n.canGoBack)}
        onLoadEnd={() => setLoading(false)} allowsBackForwardNavigationGestures pullToRefreshEnabled setSupportMultipleWindows={false} />
      {loading ? <View style={s.loading}><ActivityIndicator color={colors.ink} /></View> : null}
    </View>
  );
}

const s = StyleSheet.create({ loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' } });
