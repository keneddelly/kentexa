import React from 'react';
import { Pressable, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image } from 'expo-image';
import Icon, { IconName } from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import { mediaUrl } from '../config';
import HomeScreen from '../screens/HomeScreen';
import PostScreen from '../screens/PostScreen';
import LoginScreen from '../screens/LoginScreen';
import WebScreen from '../screens/WebScreen';
import KaziScreen from '../screens/KaziScreen';
import { AccountScreen, CreateScreen, InboxScreen, SearchScreen } from '../screens/Placeholders';
import type { RootStackParams, TabParams } from './types';

/**
 * Native navigation (#422 N0, owner: "it should be native with navigations"):
 * - bottom tabs Mwanzo · Tafuta · + · Inbox · Kazi (same bar as the web, owner 2026-11-01); each tab keeps its place;
 * - a native stack on top: Android back button and iOS swipe-back go back one screen;
 * - "+" and Ingia open as sheets from the bottom.
 */
const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

const TAB_ICONS: Record<keyof TabParams, IconName> = { Mwanzo: 'home', Tafuta: 'search', Ongeza: 'plus', Inbox: 'inbox', Kazi: 'kazi' };

function HeaderAvatar({ onPress }: { onPress: () => void }) {
  const { user } = useAuth();
  const uri = mediaUrl(user?.avatarUrl as string | undefined);
  return (
    <Pressable onPress={onPress} accessibilityLabel={user ? 'Akaunti yako' : 'Ingia'} hitSlop={10} style={{ marginLeft: 14 }}>
      {uri ? <Image source={{ uri }} style={{ width: 32, height: 32, borderRadius: 16 }} />
        : <Text style={{ fontWeight: '800', color: colors.brand, fontSize: 15 }}>{user ? (String(user.name || 'K').slice(0, 1).toUpperCase()) : 'Ingia'}</Text>}
    </Pressable>
  );
}

function Tabs({ navigation }: any) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.line },
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '800', fontSize: 17, color: colors.ink },
        tabBarIcon: ({ color, focused }) => <Icon name={TAB_ICONS[route.name as keyof TabParams]} color={color} strokeWidth={focused ? 2.6 : 2} size={route.name === 'Ongeza' ? 28 : 26} />,
        tabBarAccessibilityLabel: route.name === 'Ongeza' ? 'Tengeneza' : route.name,
      })}
    >
      <Tab.Screen name="Mwanzo" component={HomeScreen as any}
        options={{ headerTitle: () => <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>Kente<Text style={{ color: colors.brand }}>Xa</Text></Text>,
          headerLeft: () => <HeaderAvatar onPress={() => navigation.navigate('Account')} /> }} />
      <Tab.Screen name="Tafuta" component={SearchScreen as any} />
      <Tab.Screen name="Ongeza" component={SearchScreen as any}
        listeners={{ tabPress: (e) => { e.preventDefault(); navigation.navigate('Create'); } }} />
      <Tab.Screen name="Inbox" component={InboxScreen as any} />
      <Tab.Screen name="Kazi" component={KaziScreen as any} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerTintColor: colors.ink, headerTitleStyle: { fontWeight: '800', fontSize: 17 }, headerBackTitle: 'Rudi' }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Post" component={PostScreen} options={{ title: 'Chapisho' }} />
      <Stack.Screen name="Web" component={WebScreen} options={{ title: 'KenteXa' }} />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Ingia' }} />
        <Stack.Screen name="Create" component={CreateScreen} options={{ title: 'Tengeneza' }} />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Akaunti' }} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
