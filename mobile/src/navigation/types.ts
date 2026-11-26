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
  WalkIn: { city?: string; receipt?: unknown } | undefined;
  OfisiBei: undefined;
  OfisiMapato: undefined;
  OfisiWashirika: { shopName?: string } | undefined;
  OfisiTrack: { trackingNumber?: string } | undefined;
  OfisiVan: undefined;
  OfisiShehena: undefined;
  OfisiApply: undefined;
  OfisiShehenaNew: {
    shipmentId?: number; destinationCity?: string; lastMileName?: string; step?: 'add' | 'dispatch';
    /** A parcel sent as a shehena of one (web: Tuma from the TUMA list). */
    single?: { parcelId: number; trackingNumber: string; number: string; destinationCity: string; waybill?: string | null;
      recipientName?: string | null; recipientPhone?: string | null; buyerPhone?: string | null; preferredHubId?: number | null };
  } | undefined;
};

export type TabParams = {
  Mwanzo: undefined;
  Tafuta: undefined;
  Ongeza: undefined;
  Inbox: undefined;
  Kazi: undefined;
};
