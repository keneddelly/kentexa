import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Post: { id: number };
  Thread: { mode: 'buyer' | 'seller'; id: number; title?: string };
  Web: { url: string; title?: string };
  Login: undefined;
  Create: undefined;
  CreateClassified: undefined;
  Account: undefined;
  OfisiSettings: undefined;
};

export type TabParams = {
  Mwanzo: undefined;
  Tafuta: undefined;
  Ongeza: undefined;
  Inbox: undefined;
  Kazi: undefined;
};
