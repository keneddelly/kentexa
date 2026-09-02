const item = (id, labelKey, iconId, destination, placements = ['bottom']) => ({ id, labelKey, iconId, destination, placements });
const common = {
  home: item('home', 'nav.home', 'home', 'Home'), post: item('post', '', 'add', '__POST__'),
  inbox: item('inbox', 'bottom_nav.inbox', 'inbox', 'SellerInbox'), profile: item('profile', 'nav.profile', 'profile', 'MyProfile'),
};
const bottom = (second) => [common.home, second, common.post, common.inbox, common.profile];

export const ACCOUNT_ROLE_TYPES = Object.freeze(['buyer','seller','agent','super_agent','transport_provider','service_provider','customer_care','manager','admin','arbitrator']);
export const ROLE_NAVIGATION = Object.freeze({
  buyer: { home: 'Home', items: bottom(item('discover','common.search','search','Search')) },
  seller: { home: 'SellerDashboard', items: bottom(item('seller.dashboard','bottom_nav.dashboard','dashboard','SellerDashboard')) },
  agent: { home: 'AgentDashboard', items: bottom(item('agent.dashboard','bottom_nav.dashboard','agent','AgentDashboard')) },
  super_agent: { home: 'SuperAgentDashboard', items: bottom(item('hub.dashboard','bottom_nav.dashboard','hub','SuperAgentDashboard')) },
  transport_provider: { home: 'TransportProviderDashboard', items: bottom(item('transport.dashboard','bottom_nav.dashboard','transport','TransportProviderDashboard')) },
  service_provider: { home: 'MyServices', items: bottom(item('services.mine','bottom_nav.my_services','services','MyServices')) },
  customer_care: { home: 'Home', items: bottom(item('discover','common.search','search','Search')) },
  arbitrator: { home: 'Home', items: bottom(item('discover','common.search','search','Search')) },
  manager: { home: 'Dashboard', items: bottom(item('admin.dashboard','bottom_nav.dashboard','admin','Dashboard')) },
  admin: { home: 'Dashboard', items: bottom(item('admin.dashboard','bottom_nav.dashboard','admin','Dashboard')) },
});

export const ADMIN_NAVIGATION = Object.freeze([
  ['Dashboard','Dashboard','dashboard'],['Users','Users','users'],['Sellers','Sellers','seller'],['IdentityVerifications','Identity Verification','identity'],
  ['Agents','Agents','agent'],['SuperAgents','Super Agents','hub'],['AgentPerformance','Agent Performance','analytics'],['Products','Products','products'],
  ['AdminBrands','Brands','brand'],['AdminBrandAuthorizations','Brand Authorizations','verified'],['AdminWarrantyClaims','Warranty Claims','warranty'],
  ['OfficialProducts','Official Catalog','catalog'],['AdminServices','Services','services'],['Classifieds','Classifieds','listings'],['Orders','Orders','orders'],
  ['TransportAdmin','Transport Providers','transport'],['Disputes','Disputes','warning'],['Payouts','Payouts','payouts'],['Payments','Payments','payments'],
  ['Invoices','Invoices','invoices'],['FinancialDashboard','Fedha (Finance)','finance'],['Reports','Reports','reports'],['RouteManagement','Njia za Intercity','routes'],
  ['CollectionFees','Ada za Kukusanya','collection'],['ZoneManagement','Zones (Dar)','zones'],['Profile','Profile','profile'],
].map(([destination,label,iconId]) => ({ id: `admin.${destination}`, destination, label, iconId, placements: ['admin'] })));

export const navigationForRole = (roleType) => ROLE_NAVIGATION[roleType] || ROLE_NAVIGATION.buyer;
export const homeForRole = (roleType) => navigationForRole(roleType).home;
export const itemsForRole = (roleType, placement = 'bottom') => navigationForRole(roleType).items.filter((entry) => entry.placements.includes(placement));
