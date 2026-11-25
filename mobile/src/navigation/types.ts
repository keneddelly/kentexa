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
  WalkIn: { city?: string } | undefined;
  OfisiBei: undefined;
  OfisiMapato: undefined;
  OfisiWashirika: { shopName?: string } | undefined;
  OfisiTrack: { trackingNumber?: string } | undefined;
  OfisiVan: undefined;
  OfisiShehena: undefined;
  OfisiApply: undefined;
  OfisiShehenaNew: { shipmentId?: number; destinationCity?: string; lastMileName?: string; step?: 'add' | 'dispatch' } | undefined;
};

export type TabParams = {
  Mwanzo: undefined;
  Tafuta: undefined;
  Ongeza: undefined;
  Inbox: undefined;
  Kazi: undefined;
};
