const item = (id, labelKey, iconId, destination, placements = ['bottom']) => ({ id, labelKey, iconId, destination, placements });
const common = {
  home: item('home', 'nav.home', 'home', 'Home'), post: item('post', '', 'add', '__POST__'),
  inbox: item('inbox', 'bottom_nav.inbox', 'inbox', 'SellerInbox'), profile: item('profile', 'nav.profile', 'profile', 'MyProfile'),
};
// Kazi (owner 2026-11-01): one bottom bar for every role -- Mwanzo, Tafuta, Tengeneza, Inbox,
// Kazi. Each role's tools live in Kazi (Workspace); a role's `home` stays its main tool page.
// Profile opens from the avatar on the Home header and in Kazi.
const discover = item('discover', 'common.search', 'search', 'Search');
const workspace = item('workspace', 'bottom_nav.workspace', 'work', 'Workspace');
const bottom = () => [common.home, discover, common.post, common.inbox, workspace];

export const ACCOUNT_ROLE_TYPES = Object.freeze(['buyer','seller','agent','super_agent','transport_provider','service_provider','customer_care','manager','admin','arbitrator']);
export const ROLE_NAVIGATION = Object.freeze({
  buyer: { home: 'Home', items: bottom() },
  seller: { home: 'SellerDashboard', items: bottom() },
  agent: { home: 'AgentDashboard', items: bottom() },
  super_agent: { home: 'SuperAgentDashboard', items: bottom() },
  transport_provider: { home: 'TransportProviderDashboard', items: bottom() },
  service_provider: { home: 'MyServices', items: bottom() },
  customer_care: { home: 'Home', items: bottom() },
  arbitrator: { home: 'Home', items: bottom() },
  manager: { home: 'Dashboard', items: bottom() },
  admin: { home: 'Dashboard', items: bottom() },
});

export const ADMIN_NAVIGATION = Object.freeze([
  ['Dashboard','Dashboard','dashboard'],['Users','Users','users'],['Sellers','Sellers','seller'],['Businesses','Businesses','business'],['IdentityVerifications','Identity Verification','identity'],
  ['Agents','Agents','agent'],['SuperAgents','Offices','hub'],['AgentPerformance','Agent Performance','analytics'],['Products','Products','products'],
  ['AdminBrands','Brands','brand'],['AdminBrandAuthorizations','Brand Authorizations','verified'],['AdminWarrantyClaims','Warranty Claims','warranty'],
  ['OfficialProducts','Official Catalog','catalog'],['AdminServices','Services','services'],['Classifieds','Classifieds','listings'],['Orders','Orders','orders'],['AdminShipments','Shipments','shipments'],['AdminDispatchReminders','Dispatch reminders','shipments'],['AdminAdvertisers','Watangazaji','users'],
  // Owner 2026-11-08: these two were built but missing from the menu (the menu is drawn from this list).
  ['AdminKentexaFees','Ada ya KenteXa','payments'],['AdminShippingCheck','Kwa nini hakuna?','shipments'],
  ['TransportAdmin','Transport Providers','transport'],['VanOperations','Van Operations','transport'],['Disputes','Disputes','warning'],['Payouts','Payouts','payouts'],['Payments','Payments','payments'],
  ['Invoices','Invoices','invoices'],['FinancialDashboard','Fedha (Finance)','finance'],['Reports','Reports','reports'],['RouteManagement','Njia za Intercity','routes'],
  ['CollectionFees','Ada za Kukusanya','collection'],['ZoneManagement','Zones (Dar)','zones'],['Profile','Profile','profile'],
].map(([destination,label,iconId]) => ({ id: `admin.${destination}`, destination, label, iconId, placements: ['admin'] })));

export const navigationForRole = (roleType) => ROLE_NAVIGATION[roleType] || ROLE_NAVIGATION.buyer;
export const homeForRole = (roleType) => navigationForRole(roleType).home;
export const itemsForRole = (roleType, placement = 'bottom') => navigationForRole(roleType).items.filter((entry) => entry.placements.includes(placement));
