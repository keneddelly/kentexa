import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Post: { id: number };
  Web: { url: string; title?: string };
  Login: undefined;
  Create: undefined;
  Account: undefined;
};

export type TabParams = {
  Mwanzo: undefined;
  Tafuta: undefined;
  Ongeza: undefined;
  Inbox: undefined;
  Kazi: undefined;
};
