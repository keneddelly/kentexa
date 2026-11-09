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

export const ACCOUNT_ROLE_TYPES = Object.freeze(['buyer','seller','agent','super_agent','transport_provider','service_provider','customer_care','manager','admin','arbitrator','finance','moderator']);
export const ROLE_NAVIGATION = Object.freeze({
  buyer: { home: 'Home', items: bottom() },
  seller: { home: 'SellerDashboard', items: bottom() },
  agent: { home: 'AgentDashboard', items: bottom() },
  super_agent: { home: 'SuperAgentDashboard', items: bottom() },
  transport_provider: { home: 'TransportProviderDashboard', items: bottom() },
  service_provider: { home: 'MyServices', items: bottom() },
  // KenteXa staff land on the admin (owner 2026-11-09: staff roles).
  customer_care: { home: 'Dashboard', items: bottom() },
  finance: { home: 'Dashboard', items: bottom() },
  moderator: { home: 'Dashboard', items: bottom() },
  arbitrator: { home: 'Home', items: bottom() },
  manager: { home: 'Dashboard', items: bottom() },
  admin: { home: 'Dashboard', items: bottom() },
});

// Admin menu (owner 2026-11-09: "make KenteXa look like a professional company"): grouped by
// section, Swahili labels, no emoji. [destination, label, iconId, section]. Every admin page that
// exists is here, including the five that were built but hidden (Takwimu, Matangazo ya KenteXa,
// Bei za boda, Ofisi kwa miji, Ujumbe wa wateja).
export const ADMIN_SECTIONS = Object.freeze([
  ['overview', 'Muhtasari'], ['people', 'Watu'], ['business', 'Biashara'], ['catalog', 'Bidhaa na maudhui'],
  ['orders', 'Oda'], ['logistics', 'Usafirishaji'], ['finance', 'Fedha'], ['support', 'Msaada'], ['system', 'Mfumo'],
]);
export const ADMIN_NAVIGATION = Object.freeze([
  ['Dashboard', 'Muhtasari', 'dashboard', 'overview'], ['AdminActivity', 'Shughuli', 'clock', 'overview'], ['Analytics', 'Takwimu', 'analytics', 'overview'], ['Reports', 'Ripoti', 'reports', 'overview'],
  ['Users', 'Watumiaji', 'users', 'people'], ['AdminOnboarding', 'Karibu: wanaojiunga', 'analytics', 'people'], ['IdentityVerifications', 'Vitambulisho', 'identity', 'people'],
  ['Businesses', 'Biashara', 'business', 'business'], ['Sellers', 'Wauzaji', 'seller', 'business'], ['AdminAdvertisers', 'Watangazaji', 'announce', 'business'],
  ['AdminTeamInvitations', 'Mialiko ya timu', 'users', 'business'], ['AdminInstagram', 'Instagram', 'chat', 'business'], ['AdminPosSales', 'Mauzo ya POS', 'payments', 'business'], ['AdminHotelOrders', 'Oda za hoteli', 'orders', 'business'],
  ['Products', 'Bidhaa', 'products', 'catalog'], ['OfficialProducts', 'Katalogi rasmi', 'catalog', 'catalog'], ['AdminBrands', 'Chapa', 'brand', 'catalog'],
  ['AdminBrandAuthorizations', 'Idhini za chapa', 'verified', 'catalog'], ['AdminWarrantyClaims', 'Madai ya dhamana', 'warranty', 'catalog'],
  ['AdminServices', 'Huduma', 'services', 'catalog'], ['Classifieds', 'Matangazo', 'listings', 'catalog'],
  ['AdminMoments', 'Moments', 'listings', 'catalog'], ['AdminReports', 'Moments zilizoripotiwa', 'warning', 'catalog'], ['AdminCommunities', 'Jumuiya', 'users', 'catalog'], ['AdminReviews', 'Maoni', 'verified', 'catalog'],
  ['Orders', 'Oda', 'orders', 'orders'],
  ['AdminShipments', 'Mizigo', 'shipments', 'logistics'], ['AdminShippingCheck', 'Kwa nini hakuna?', 'search', 'logistics'],
  ['AdminDispatchReminders', 'Vikumbusho vya kutuma', 'clock', 'logistics'], ['AdminAgentJobs', 'Kazi za mawakala', 'agent', 'logistics'], ['AdminOfficePrices', 'Bei za ofisi', 'payments', 'logistics'], ['Agents', 'Mawakala', 'agent', 'logistics'],
  ['AgentPerformance', 'Utendaji wa mawakala', 'analytics', 'logistics'], ['SuperAgents', 'Ofisi', 'hub', 'logistics'], ['HubAdmin', 'Ofisi kwa miji', 'hub', 'logistics'],
  ['TransportAdmin', 'Wasafirishaji', 'transport', 'logistics'], ['VanOperations', 'Van', 'transport', 'logistics'], ['RouteManagement', 'Njia za mikoa', 'routes', 'logistics'],
  ['BodaRates', 'Bei za boda', 'collection', 'logistics'], ['CollectionFees', 'Ada za kukusanya', 'collection', 'logistics'],
  ['FinancialDashboard', 'Fedha', 'finance', 'finance'], ['Payments', 'Malipo', 'payments', 'finance'], ['Payouts', 'Malipo kwa wauzaji', 'payouts', 'finance'],
  ['Invoices', 'Ankara', 'invoices', 'finance'], ['AdminKentexaFees', 'Ada ya KenteXa', 'payments', 'finance'],
  ['ContactMessages', 'Ujumbe wa wateja', 'chat', 'support'], ['AdminChats', 'Mazungumzo', 'chat', 'support'], ['Announcements', 'Tuma taarifa', 'announce', 'support'], ['AdminNotifications', 'Taarifa zilizotumwa', 'announce', 'support'], ['Disputes', 'Migogoro', 'warning', 'support'],
  ['AdminStaff', 'Wafanyakazi', 'users', 'system'], ['Profile', 'Wasifu', 'profile', 'system'],
].map(([destination, label, iconId, section]) => ({ id: `admin.${destination}`, destination, label, iconId, section, placements: ['admin'] })));

/**
 * Which admin menu items each KenteXa staff role sees (owner 2026-11-09: Manager, Customer care,
 * Finance, Moderator). Mirrors the server's areas (auth/staff-access.ts); the server decides.
 */
export const STAFF_ROLE_TYPES = Object.freeze(['manager', 'customer_care', 'finance', 'moderator']);
const FINANCE_PAGES = new Set(['AdminKentexaFees', 'Payments', 'Payouts', 'Invoices', 'FinancialDashboard', 'AdminPosSales']);
export function adminMenuFor(roleType) {
  if (roleType === 'admin' || !roleType) return ADMIN_NAVIGATION;
  const keep = {
    manager: (e) => e.destination !== 'AdminStaff' && e.destination !== 'AdminKentexaFees',
    customer_care: (e) => e.section !== 'finance' && !FINANCE_PAGES.has(e.destination) && e.destination !== 'AdminStaff',
    finance: (e) => ['overview', 'orders', 'finance'].includes(e.section) || FINANCE_PAGES.has(e.destination) || e.destination === 'Profile',
    // Tuma taarifa: admin, manager and customer care only (the server refuses finance and moderator).
    moderator: (e) => (['overview', 'people', 'business', 'catalog', 'support'].includes(e.section) && !FINANCE_PAGES.has(e.destination) && e.destination !== 'Announcements') || e.destination === 'Profile',
  }[roleType];
  return keep ? ADMIN_NAVIGATION.filter(keep) : [];
}

export const navigationForRole = (roleType) => ROLE_NAVIGATION[roleType] || ROLE_NAVIGATION.buyer;
export const homeForRole = (roleType) => navigationForRole(roleType).home;
export const itemsForRole = (roleType, placement = 'bottom') => navigationForRole(roleType).items.filter((entry) => entry.placements.includes(placement));
