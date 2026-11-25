import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon, { IconName } from '../components/Icon';
import { F, colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import PostScreen from '../screens/PostScreen';
import LoginScreen from '../screens/LoginScreen';
import WebScreen from '../screens/WebScreen';
import KaziScreen from '../screens/KaziScreen';
import OfisiKaziScreen from '../screens/OfisiKaziScreen';
import { CreateScreen } from '../screens/Placeholders';
import CreateClassifiedScreen from '../screens/CreateClassifiedScreen';
import AccountScreen from '../screens/AccountScreen';
import SearchScreen from '../screens/SearchScreen';
import InboxScreen from '../screens/InboxScreen';
import ThreadScreen from '../screens/ThreadScreen';
import OfisiScreen from '../screens/OfisiScreen';
import OfisiSettingsScreen from '../screens/OfisiSettingsScreen';
import OfisiWalkInScreen from '../screens/OfisiWalkInScreen';
import OfisiBeiScreen from '../screens/OfisiBeiScreen';
import OfisiMapatoScreen from '../screens/OfisiMapatoScreen';
import OfisiWashirikaScreen from '../screens/OfisiWashirikaScreen';
import OfisiTrackScreen from '../screens/OfisiTrackScreen';
import OfisiVanScreen from '../screens/OfisiVanScreen';
import OfisiShehenaScreen from '../screens/OfisiShehenaScreen';
import OfisiShehenaNewScreen from '../screens/OfisiShehenaNewScreen';
import { VARIANT } from '../config';
import type { RootStackParams, TabParams } from './types';

/**
 * Native navigation (#422 N0, owner: "it should be native with navigations"):
 * - bottom tabs Mwanzo · Tafuta · + · Inbox · Kazi (same bar as the web, owner 2026-11-01); each tab keeps its place;
 * - a native stack on top: Android back button and iOS swipe-back go back one screen;
 * - "+" and Ingia open as sheets from the bottom.
 */
const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

const TAB_ICONS: Record<keyof TabParams, IconName> = { Mwanzo: 'home', Tafuta: 'search', Ongeza: 'plusBox', Inbox: 'inbox', Kazi: 'kazi' };

/** The Ofisi app (VARIANT=ofisi) is the office's own bar: Mwanzo (the office), Inbox, Kazi. */
const OFISI = VARIANT === 'ofisi';

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
        headerTitleStyle: { fontFamily: F.black, fontSize: 17, color: colors.ink },
        tabBarIcon: ({ focused }) => (route.name === 'Mwanzo' && focused
          ? <Icon name="homeFill" color={colors.ink} fill={colors.ink} size={26} />
          : <Icon name={TAB_ICONS[route.name as keyof TabParams]} color={colors.ink} strokeWidth={focused ? 2.6 : 1.8} size={route.name === 'Ongeza' ? 28 : 26} />),
        tabBarAccessibilityLabel: route.name === 'Ongeza' ? 'Tengeneza' : route.name,
      })}
    >
      <Tab.Screen name="Mwanzo" component={(OFISI ? OfisiScreen : HomeScreen) as any} options={{ headerShown: false }} />
      {!OFISI && <Tab.Screen name="Tafuta" component={SearchScreen as any} />}
      {!OFISI && <Tab.Screen name="Ongeza" component={SearchScreen as any}
        listeners={{ tabPress: (e) => { e.preventDefault(); navigation.navigate('Create'); } }} />}
      <Tab.Screen name="Inbox" component={InboxScreen as any} />
      <Tab.Screen name="Kazi" component={(OFISI ? OfisiKaziScreen : KaziScreen) as any} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerTintColor: colors.ink, headerTitleStyle: { fontFamily: F.black, fontSize: 17 }, headerBackTitle: 'Rudi' }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Post" component={PostScreen} options={{ title: 'Chapisho' }} />
      <Stack.Screen name="CreateClassified" component={CreateClassifiedScreen} options={{ title: 'Weka tangazo' }} />
      <Stack.Screen name="OfisiSettings" component={OfisiSettingsScreen} options={{ title: 'Mipangilio ya ofisi' }} />
      <Stack.Screen name="WalkIn" component={OfisiWalkInScreen} options={{ title: 'Walk-in' }} />
      <Stack.Screen name="OfisiBei" component={OfisiBeiScreen} options={{ title: 'Bei zangu' }} />
      <Stack.Screen name="OfisiMapato" component={OfisiMapatoScreen} options={{ title: 'Mapato' }} />
      <Stack.Screen name="OfisiWashirika" component={OfisiWashirikaScreen} options={{ title: 'Washirika' }} />
      <Stack.Screen name="OfisiTrack" component={OfisiTrackScreen} options={{ title: 'Fuatilia mzigo' }} />
      <Stack.Screen name="OfisiVan" component={OfisiVanScreen} options={{ title: 'Van Desk' }} />
      <Stack.Screen name="OfisiShehena" component={OfisiShehenaScreen} options={{ title: 'Shehena' }} />
      <Stack.Screen name="OfisiShehenaNew" component={OfisiShehenaNewScreen} options={{ title: 'Shehena mpya' }} />
      <Stack.Screen name="Thread" component={ThreadScreen} options={{ title: 'Mazungumzo' }} />
      <Stack.Screen name="Web" component={WebScreen} options={{ title: 'KenteXa' }} />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Ingia' }} />
        <Stack.Screen name="Create" component={CreateScreen} options={{ title: 'Tengeneza' }} />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Akaunti' }} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
