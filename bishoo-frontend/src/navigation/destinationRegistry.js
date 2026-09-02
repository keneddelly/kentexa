export const DESTINATION_KIND = Object.freeze({ PUBLIC: 'public', ACCOUNT: 'account', OPERATIONAL: 'operational', ADMIN: 'admin' });

const destination = (id, kind, roles = [], capabilities = []) => ({ id, page: id, kind, roles, capabilities });
const PUBLIC_PAGES = ['Home','AboutUs','ContactUs','HowItWorks','Privacy','PrivacyPolicy','Terms','TermsAndConditions','FlashSales','PickupPoints','ClassifiedDetail','ServiceDetail','ProductDetail','VerifyProduct','RouteCoverageMap','Store','Stores','ClassifiedsPublic','PublicLogin','Register','Search','Discover','Cart','BecomeSeller','BecomeSellerInfo','BecomeAgent','BecomeSuperAgentInfo','BecomeBusiness','VerifyReceipt','PayInvoice','TrackParcel','Services','Listings'];
const ACCOUNT_PAGES = ['Activity','RoleActivation','Onboarding','AddProfilePhoto','MyProfile','MyWarranties','OrderTracking','MyOrders','CustomerProfile','Checkout','Wishlist','SellerInbox','BusinessDashboard','BrandDashboard','BrandCatalog','PostService'];
const SELLER_PAGES = ['SellerDashboard','SellerCustomers','SellerPayouts','SellerWallet','StoreSettings','SellerProducts','MyBrands','POS','SellerClassifieds','SellerOrders','SellerShipping','SendShipment','SellerInvoices','SellerShipment','SellerWarrantyClaims','SellerAnalytics','SellerTeam'];
const AGENT_PAGES = ['AgentDashboard','AgentOrderDashboard','AgentEarnings','AgentScorecard'];
const HUB_PAGES = ['SuperAgentDashboard','DispatcherManifest','HubReceive','BatchHandoff','SuperAgentParcel','SuperAgentSettings'];
const TRANSPORT_PAGES = ['TransportProviderDashboard','TransportProviderSettings'];
const ADMIN_PAGES = ['Profile','Dashboard','Products','Classifieds','Users','Orders','Payments','Sellers','AdminServices','IdentityVerifications','AdminBrands','AdminBrandAuthorizations','AdminWarrantyClaims','OfficialProducts','Agents','SuperAgents','Disputes','Payouts','Invoices','Reports','ContactMessages','Announcements','Analytics','ZoneManagement','BodaRates','RouteManagement','CollectionFees','AgentPerformance','FinancialDashboard','TransportAdmin','HubAdmin'];

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
  [/^SellerInbox-/, 'SellerInbox'], [/^SellerOrders-/, 'SellerOrders'], [/^SellerPayouts-/, 'SellerPayouts'], [/^SellerWarrantyClaims-/, 'SellerWarrantyClaims'],
  [/^EditProduct-/, 'SellerProducts'], [/^EditClassified-/, 'SellerClassifieds'], [/^BuyerParcelAction-/, 'MyOrders'], [/^BatchHandoff-/, 'BatchHandoff'],
];

export const destinationForPage = (page) => {
  if (typeof page !== 'string') return null;
  if (DESTINATIONS[page]) return DESTINATIONS[page];
  const match = DYNAMIC_DESTINATIONS.find(([pattern]) => pattern.test(page));
  return match ? DESTINATIONS[match[1]] || null : null;
};
export const destinationCount = Object.keys(DESTINATIONS).length;
