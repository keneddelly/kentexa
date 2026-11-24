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
import { CreateScreen } from '../screens/Placeholders';
import AccountScreen from '../screens/AccountScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import SearchScreen from '../screens/SearchScreen';
import InboxScreen from '../screens/InboxScreen';
import ThreadScreen from '../screens/ThreadScreen';
import type { RootStackParams, TabParams } from './types';

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();
const TAB_ICONS: Record<keyof TabParams, IconName> = { Mwanzo: 'home', Tafuta: 'search', Ongeza: 'plusBox', Inbox: 'inbox', Kazi: 'kazi' };

function Tabs({ navigation }: any) {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      tabBarShowLabel: false, tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { borderTopColor: colors.line }, headerTitleAlign: 'center', headerShadowVisible: false,
      headerStyle: { backgroundColor: '#fff' }, headerTitleStyle: { fontFamily: F.black, fontSize: 17, color: colors.ink },
      tabBarIcon: ({ focused }) => route.name === 'Mwanzo' && focused
        ? <Icon name="homeFill" color={colors.ink} fill={colors.ink} size={26} />
        : <Icon name={TAB_ICONS[route.name as keyof TabParams]} color={colors.ink} strokeWidth={focused ? 2.6 : 1.8} size={route.name === 'Ongeza' ? 28 : 26} />,
      tabBarAccessibilityLabel: route.name === 'Ongeza' ? 'Tengeneza' : route.name,
    })}>
      <Tab.Screen name="Mwanzo" component={HomeScreen as any} options={{ headerShown: false }} />
      <Tab.Screen name="Tafuta" component={SearchScreen as any} />
      <Tab.Screen name="Ongeza" component={SearchScreen as any} listeners={{ tabPress: (e) => { e.preventDefault(); navigation.navigate('Create'); } }} />
      <Tab.Screen name="Inbox" component={InboxScreen as any} />
      <Tab.Screen name="Kazi" component={KaziScreen as any} />
    </Tab.Navigator>
  );
}
export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerTintColor: colors.ink, headerTitleStyle: { fontFamily: F.black, fontSize: 17 }, headerBackTitle: 'Rudi' }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Post" component={PostScreen} options={{ title: 'Chapisho' }} />
      <Stack.Screen name="Thread" component={ThreadScreen} options={{ title: 'Mazungumzo' }} />
      <Stack.Screen name="Web" component={WebScreen} options={{ title: 'KenteXa' }} />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Ingia' }} />
        <Stack.Screen name="Create" component={CreateScreen} options={{ title: 'Tengeneza' }} />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Akaunti' }} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Arifa' }} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
