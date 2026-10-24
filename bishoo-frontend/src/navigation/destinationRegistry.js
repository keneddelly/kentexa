export const DESTINATION_KIND = Object.freeze({ PUBLIC: 'public', ACCOUNT: 'account', OPERATIONAL: 'operational', ADMIN: 'admin' });

const destination = (id, kind, roles = [], capabilities = []) => ({ id, page: id, kind, roles, capabilities });
const PUBLIC_PAGES = ['Home','AboutUs','ContactUs','HowItWorks','Privacy','PrivacyPolicy','Terms','TermsAndConditions','FlashSales','PickupPoints','ClassifiedDetail','ServiceDetail','ProductDetail','VerifyProduct','RouteCoverageMap','Store','Stores','ClassifiedsPublic','PublicLogin','Register','Search','Discover','Cart','BecomeSeller','BecomeSellerInfo','BecomeAgent','BecomeSuperAgentInfo','BecomeBusiness','VerifyReceipt','PayInvoice','TrackParcel','Services','Listings'];
const ACCOUNT_PAGES = ['Activity','RoleActivation','Onboarding','AddProfilePhoto','MyProfile','MyWarranties','OrderTracking','MyOrders','CustomerProfile','EditPublicProfile','PayoutSettings','Checkout','Wishlist','SellerInbox','SendShipment','MyShipments','BusinessDashboard','BrandDashboard','BrandCatalog','PostService','MyBusinesses','ConnectSelling','BusinessHome','MyClassifieds','CreateClassified'];
const SELLER_PAGES = ['SellerDashboard','SellerCustomers','SellerPayouts','SellerWallet','StoreSettings','SellerProducts','MyBrands','POS','SellerClassifieds','SellerOrders','SellerShipping','SellerInvoices','SellerShipment','SellerWarrantyClaims','SellerAnalytics','SellerTeam'];
const AGENT_PAGES = ['AgentDashboard','AgentOrderDashboard','AgentEarnings','AgentScorecard'];
const HUB_PAGES = ['SuperAgentDashboard','DispatcherManifest','HubReceive','BatchHandoff','SuperAgentParcel','SuperAgentSettings'];
const TRANSPORT_PAGES = ['TransportProviderDashboard','TransportProviderSettings'];
const ADMIN_PAGES = ['Profile','Dashboard','Products','Classifieds','Users','Orders','Payments','Sellers','AdminServices','IdentityVerifications','AdminBrands','AdminBrandAuthorizations','AdminWarrantyClaims','OfficialProducts','Agents','SuperAgents','Disputes','Payouts','Invoices','Reports','ContactMessages','Announcements','Analytics','ZoneManagement','BodaRates','RouteManagement','CollectionFees','AgentPerformance','FinancialDashboard','TransportAdmin','VanOperations','HubAdmin',
  // In the admin menu but missing here, so a click went back to the Dashboard (2026-10-24).
  'Businesses','AdminShipments','AdminDispatchReminders'];

export const DESTINATIONS = Object.freeze(Object.fromEntries([
  ...PUBLIC_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.PUBLIC)]),
  ['CommerceProfile', destination('CommerceProfile', DESTINATION_KIND.PUBLIC)],
  ...ACCOUNT_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.ACCOUNT)]),
  ...SELLER_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.OPERATIONAL, ['seller'])]),
  ...AGENT_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.OPERATIONAL, ['agent'])]),
  ...HUB_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.OPERATIONAL, ['super_agent'])]),
  ...TRANSPORT_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.OPERATIONAL, ['transport_provider'])]),
  ['VanToday', destination('VanToday', DESTINATION_KIND.OPERATIONAL, ['seller', 'super_agent'])],
  ['BecomeTransportProvider', destination('BecomeTransportProvider', DESTINATION_KIND.ACCOUNT)],
  // Existing MyServices identity/backend behavior remains a documented Phase F dependency.
  ['MyServices', destination('MyServices', DESTINATION_KIND.OPERATIONAL, ['service_provider', 'seller'])],
  ...ADMIN_PAGES.map((id) => [id, destination(id, DESTINATION_KIND.ADMIN, ['admin', 'manager'])]),
]));

const DYNAMIC_DESTINATIONS = [
  [/^ProductDetail-/, 'ProductDetail'], [/^ClassifiedDetail-/, 'ClassifiedDetail'], [/^ServiceDetail-/, 'ServiceDetail'],
  [/^(CommerceProfile|Store|SellerStore)-/, 'CommerceProfile'], [/^Search-/, 'Search'], [/^Category-/, 'Search'], [/^Listings-/, 'Listings'],
  [/^Track(Parcel|Order)-/, 'TrackParcel'], [/^ConfirmDelivery-/, 'TrackParcel'], [/^PayInvoice-/, 'PayInvoice'], [/^VerifyReceipt-/, 'VerifyReceipt'],
  [/^MyOrders-/, 'MyOrders'], [/^OrderTracking-/, 'OrderTracking'], [/^MyWarranties-/, 'MyWarranties'], [/^MessageSeller-/, 'SellerInbox'],
  [/^MessageOperational-/, 'SellerInbox'],
  [/^SellerInbox-/, 'SellerInbox'], [/^SellerOrders-/, 'SellerOrders'], [/^SellerPayouts-/, 'SellerPayouts'], [/^SellerWarrantyClaims-/, 'SellerWarrantyClaims'],
  [/^EditProduct-/, 'SellerProducts'], [/^EditClassified-/, 'SellerClassifieds'], [/^BuyerParcelAction-/, 'MyOrders'], [/^BatchHandoff-/, 'BatchHandoff'],
  [/^BusinessHome-/, 'BusinessHome'],
  // I2 correction: the I2C/I2D/B6C Business routes App.js already handles. Each
  // pattern is anchored and numeric (and, for capabilities, limited to the two
  // codes the App parser supports) -- deliberately NOT a broad wildcard.
  [/^BusinessDashboard-\d+$/, 'BusinessDashboard'],
  [/^BecomeBusinessCapability-\d+-(commerce|transport)$/, 'BecomeBusinessCapability'],
  [/^BecomeBusinessServiceProvider-\d+$/, 'BecomeBusinessServiceProvider'],
  // The seller's private new-order link (?sellerCheckout=<signed token>): public, the token is the key.
  [/^SellerCheckout-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'SellerCheckout'],
  // The short seller link (?so=..., 2026-10-23): five base-36 parts and a 16-character signature.
  [/^SellerCheckout-[0-9a-z]{1,12}\.[0-9a-z-]{1,200}\.[0-9a-z]{1,12}\.[0-9a-z]{0,12}\.[0-9a-z]{0,12}\.[A-Za-z0-9_-]{16}$/, 'SellerCheckout'],
  // A Super Agent's partner invitation (?partnerInvite=<signed token>): public; accepting needs login.
  [/^PartnerInvite-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'PartnerInvite'],
  // A seller's partner-agent invitation (?agentInvite=<signed token>): public; accepting needs login.
  [/^SellerAgentInvite-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'SellerAgentInvite'],
];

// Destinations that exist ONLY as dynamic routes: their bare names are not
// navigable pages (App.js has no case for them), so they stay out of DESTINATIONS.
const DYNAMIC_ONLY_DESTINATIONS = Object.freeze({
  BecomeBusinessCapability: destination('BecomeBusinessCapability', DESTINATION_KIND.ACCOUNT),
  BecomeBusinessServiceProvider: destination('BecomeBusinessServiceProvider', DESTINATION_KIND.ACCOUNT),
  SellerCheckout: destination('SellerCheckout', DESTINATION_KIND.PUBLIC),
  PartnerInvite: destination('PartnerInvite', DESTINATION_KIND.PUBLIC),
  SellerAgentInvite: destination('SellerAgentInvite', DESTINATION_KIND.PUBLIC),
});

export const destinationForPage = (page) => {
  if (typeof page !== 'string') return null;
  if (DESTINATIONS[page]) return DESTINATIONS[page];
  const match = DYNAMIC_DESTINATIONS.find(([pattern]) => pattern.test(page));
  return match ? DESTINATIONS[match[1]] || DYNAMIC_ONLY_DESTINATIONS[match[1]] || null : null;
};
export const destinationCount = Object.keys(DESTINATIONS).length;
