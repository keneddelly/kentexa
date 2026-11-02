/**
 * workspaceModel.js — Kazi (My Workspace), phase 1 (owner approved 2026-11-01).
 *
 * Builds the workspaces a person can work in from the server's own role list
 * (/auth/roles, adapted by rolePresentation.js into `roleOptions`) and their
 * businesses (/business/mine/all). Presentation only: it never grants anything.
 * A tool opens a page; that page's own route guard and the server's checks decide.
 *
 *  - Binafsi (personal): the account's own tools, plus personal operational roles
 *    (an agent, or a legacy role not yet tied to a business).
 *  - One workspace per business: the roles the person holds IN that business
 *    (seller, office, transport, service). Two businesses never share a workspace.
 *
 * A role's state comes from the server (status, switchable, reason): active roles
 * show tools; pending, suspended, rejected or unavailable roles show their state,
 * never their tools.
 */

// Line-icon paths (24x24, stroke). No emoji in the product UI.
export const ICON = Object.freeze({
  box: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
  order: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  pos: 'M3 5h18v10H3zM7 19h10M12 15v4',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 010 7M22 21c0-3-2-5-4-5.5',
  invoice: 'M6 2h9l3 3v17H6zM9 9h6M9 13h6M9 17h3',
  truck: 'M3 7h11v10H3zM14 10h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  team: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  bike: 'M5 17a3 3 0 100-6 3 3 0 000 6zM19 17a3 3 0 100-6 3 3 0 000 6zM8 14l4-7h4l3 7M12 7l-3 7',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2',
  parcel: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  tag: 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01',
  office: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  chat: 'M4 5h16v11H8l-4 4z',
  wrench: 'M14.5 6.5a5 5 0 00-6-4l3 3-3 3-3-3a5 5 0 004 6L18 20a2 2 0 003-3l-8.5-8.5',
  wallet: 'M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h6M18 9v6a4 4 0 01-4 4H8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  store: 'M3 9l2-6h14l2 6M4 12v9h16v-9M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0',
});

const tool = (key, label, destination, icon) => ({ key, label, destination, icon });

/** The tools each approved role opens (existing pages only; nothing new is invented). */
export const ROLE_TOOLS = Object.freeze({
  seller: [
    tool('seller.products', 'Bidhaa', 'SellerProducts', ICON.box),
    tool('seller.orders', 'Oda', 'SellerOrders', ICON.order),
    tool('seller.pos', 'POS', 'POS', ICON.pos),
    tool('seller.customers', 'Wateja', 'SellerCustomers', ICON.people),
    tool('seller.invoices', 'Ankara', 'SellerInvoices', ICON.invoice),
    tool('seller.send', 'Tuma mzigo', 'SellerShipment', ICON.truck),
    tool('seller.team', 'Timu', 'SellerTeam', ICON.team),
    tool('seller.analytics', 'Takwimu', 'SellerAnalytics', ICON.chart),
    tool('seller.wallet', 'Pesa', 'SellerWallet', ICON.wallet),
    tool('seller.store', 'Duka', 'StoreSettings', ICON.store),
  ],
  super_agent: [
    tool('office.desk', 'POKEA na TUMA', 'SuperAgentDashboard', ICON.office),
    tool('office.quotes', 'Maombi ya bei', 'QuoteInbox', ICON.chat),
    tool('office.settings', 'Mipangilio ya ofisi', 'SuperAgentSettings', ICON.gear),
  ],
  agent: [
    tool('agent.jobs', 'Kazi za wakala', 'AgentDashboard', ICON.bike),
    tool('agent.earnings', 'Mapato yangu', 'AgentEarnings', ICON.wallet),
  ],
  transport_provider: [
    tool('transport.trips', 'Safari na mizigo', 'TransportProviderDashboard', ICON.truck),
    tool('transport.quotes', 'Maombi ya bei', 'QuoteInbox', ICON.chat),
    tool('transport.routes', 'Njia', 'RouteCoverageMap', ICON.route),
    tool('transport.settings', 'Mipangilio', 'TransportProviderSettings', ICON.gear),
  ],
  service_provider: [
    tool('service.mine', 'Huduma zangu', 'MyServices', ICON.wrench),
    tool('service.post', 'Weka huduma', 'PostService', ICON.tag),
    tool('service.quotes', 'Maombi ya bei', 'QuoteInbox', ICON.chat),
  ],
  admin: [tool('admin.dashboard', 'Usimamizi wa KenteXa', 'Dashboard', ICON.shield)],
  manager: [tool('admin.dashboard', 'Usimamizi wa KenteXa', 'Dashboard', ICON.shield)],
});

/** What each role is called on its workspace card. */
export const ROLE_LABEL = Object.freeze({
  seller: 'Duka', super_agent: 'Ofisi', agent: 'Wakala', transport_provider: 'Usafiri',
  service_provider: 'Huduma', admin: 'Usimamizi', manager: 'Usimamizi', customer_care: 'Huduma kwa wateja',
  arbitrator: 'Usuluhishi', buyer: 'Binafsi',
});

/** The account's own tools: always there for a logged-in person, no role switch needed. */
export const PERSONAL_TOOLS = Object.freeze([
  tool('me.orders', 'Oda zangu', 'MyOrders', ICON.bag),
  tool('me.shipments', 'Mizigo yangu', 'MyShipments', ICON.parcel),
  tool('me.send', 'Tuma mzigo', 'SendShipment', ICON.truck),
  tool('me.classifieds', 'Matangazo yangu', 'MyClassifieds', ICON.tag),
  tool('me.businesses', 'Biashara zangu', 'MyBusinesses', ICON.store),
]);

/** "Fanya kazi na KenteXa": the existing application pages for a role not held yet. */
export const START_OPTIONS = Object.freeze([
  { key: 'seller', label: 'Uza', note: 'Fungua duka lako', destination: 'BecomeSeller', icon: ICON.store },
  { key: 'service_provider', label: 'Toa huduma', note: 'Fundi, mtaalamu', destination: 'PostService', icon: ICON.wrench },
  { key: 'agent', label: 'Kuwa wakala', note: 'Chukua na peleka mizigo', destination: 'BecomeAgent', icon: ICON.bike },
  { key: 'super_agent', label: 'Fungua ofisi', note: 'Pokea na tuma mizigo', destination: 'BecomeSuperAgentInfo', icon: ICON.office },
]);

export const ROLE_STATE = Object.freeze({
  ACTIVE: 'active', PENDING: 'pending', SUSPENDED: 'suspended', REJECTED: 'rejected', UNAVAILABLE: 'unavailable',
});

/** The state of one role, from the server's own status and switchable flag. */
export const roleState = (role) => {
  const status = String(role?.status || '').toLowerCase();
  if (status === 'pending') return ROLE_STATE.PENDING;
  if (status === 'suspended' || status === 'revoked') return ROLE_STATE.SUSPENDED;
  if (status === 'rejected') return ROLE_STATE.REJECTED;
  if (status === 'active' && role.switchable !== false) return ROLE_STATE.ACTIVE;
  return ROLE_STATE.UNAVAILABLE;
};

/** The words a state card shows: what is happening and what the person can do. */
export const STATE_TEXT = Object.freeze({
  [ROLE_STATE.PENDING]: { badge: 'Inasubiri idhini', tone: 'amber', text: 'Ombi lako limepokelewa. Zana zitaonekana hapa KenteXa ikishaidhinisha.' },
  [ROLE_STATE.SUSPENDED]: { badge: 'Imesimamishwa', tone: 'red', text: 'Imesimamishwa kwa muda. Rekodi za zamani bado zipo; huwezi kufanya kazi mpya mpaka irejeshwe.' },
  [ROLE_STATE.REJECTED]: { badge: 'Halikukubaliwa', tone: 'red', text: 'Ombi hili halikukubaliwa. Unaweza kuwasiliana na KenteXa kujua sababu.' },
  [ROLE_STATE.UNAVAILABLE]: { badge: 'Haipatikani sasa', tone: 'muted', text: 'Kazi hii haipatikani kwa sasa. Fungua ukurasa wa biashara kuona kinachohitajika.' },
});

const PERSONAL_HIDDEN = new Set(['buyer']);

/**
 * The workspaces, in a stable order: Binafsi first, then each business by name.
 * `roles` are roleOptions (rolePresentation.js); `businesses` from /business/mine/all.
 */
export function buildWorkspaces(roles = [], businesses = [], activeAccountRoleId = null) {
  const entry = (role) => ({
    accountRoleId: role.accountRoleId,
    roleType: role.roleType,
    label: ROLE_LABEL[role.roleType] || role.roleType,
    state: roleState(role),
    isActive: activeAccountRoleId != null && Number(activeAccountRoleId) === Number(role.accountRoleId),
    tools: ROLE_TOOLS[role.roleType] || [],
  });

  const personal = {
    key: 'personal', kind: 'personal', businessId: null, title: 'Binafsi', subtitle: 'Wewe mwenyewe',
    roles: (roles || []).filter((r) => r.businessId == null && !PERSONAL_HIDDEN.has(r.roleType)).map(entry),
    tools: PERSONAL_TOOLS,
  };

  const byBusiness = new Map();
  for (const b of businesses || []) {
    byBusiness.set(Number(b.id), { key: `business-${b.id}`, kind: 'business', businessId: Number(b.id),
      title: b.tradingName || b.legalName || `Biashara #${b.id}`, roles: [], tools: [] });
  }
  for (const r of roles || []) {
    if (r.businessId == null) continue;
    const id = Number(r.businessId);
    if (!byBusiness.has(id)) {
      byBusiness.set(id, { key: `business-${id}`, kind: 'business', businessId: id,
        title: r.businessName || r.displayName || `Biashara #${id}`, roles: [], tools: [] });
    }
    byBusiness.get(id).roles.push(entry(r));
  }
  const businessList = [...byBusiness.values()]
    .map((w) => ({ ...w, subtitle: w.roles.length ? w.roles.map((r) => r.label).join(' · ') : 'Bado haijaanza kazi' }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return [personal, ...businessList];
}

/** Which workspace opens first: the one holding the active role, else Binafsi. */
export function initialWorkspaceKey(workspaces = [], activeAccountRoleId = null) {
  const holding = workspaces.find((w) => w.roles.some((r) => r.isActive));
  return (holding || workspaces[0] || { key: 'personal' }).key;
}

/** Roles not held yet, for "Fanya kazi na KenteXa" (a pending one counts as held: its card shows instead). */
export function startOptionsFor(roles = []) {
  const held = new Set((roles || []).map((r) => r.roleType));
  return START_OPTIONS.filter((o) => !held.has(o.key));
}

// ── Recently used: kept on this device only, a convenience, never authority ──
const RECENT_KEY = 'kentexa_kazi_recent';
export const readRecentTools = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.key === 'string').slice(0, 4) : [];
  } catch { return []; }
};
export const rememberTool = (item) => {
  try {
    const list = [item, ...readRecentTools().filter((x) => x.key !== item.key || x.accountRoleId !== item.accountRoleId)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
};

/** Recent tools that are still usable now (the role still active and held). */
export function usableRecent(recent = [], workspaces = []) {
  const activeRoleIds = new Set(workspaces.flatMap((w) => w.roles.filter((r) => r.state === ROLE_STATE.ACTIVE).map((r) => Number(r.accountRoleId))));
  return recent.filter((x) => x.accountRoleId == null || activeRoleIds.has(Number(x.accountRoleId)));
}
