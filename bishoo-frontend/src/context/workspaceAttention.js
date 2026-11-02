/**
 * workspaceAttention.js — Kazi phase 2 (owner 2026-11-01): "Kinachohitaji wewe".
 *
 * What needs the person's action now, read from the SAME endpoints the tools
 * themselves use (no new order, payment, shipment or notification system).
 * Counts come only from those answers: a source that fails or returns nothing
 * shows nothing, never a guess.
 *
 * Operational endpoints answer for the ACTIVE role only (the server scopes them
 * to the active context), so role items are read for the active role; the other
 * roles' items appear when the person works in them. Personal items are always read.
 */

const count = (v) => (Array.isArray(v) ? v.length : 0);
const asList = (data, field) => (Array.isArray(data) ? data : Array.isArray(data?.[field]) ? data[field] : []);

/** Open quote requests this provider has not answered yet. */
const unansweredQuotes = (data) => asList(data, 'requests').filter((r) => r && r.status === 'open' && !r.myOffer).length;

/**
 * Per role: each source reads one existing endpoint and returns 0..n items
 * { key, label, count, destination, tone }. `params` carries the active profile
 * scope the tool page itself sends.
 */
export const ROLE_ATTENTION = Object.freeze({
  seller: async (api, { params }) => {
    const data = (await api.get('/seller/dashboard', params ? { params } : undefined)).data || {};
    const toSend = Number(data?.stats?.needsShipping) || 0;
    const lipa = asList(data, 'recentOrders')
      .filter((o) => o?.paymentMethod === 'lipa_namba' && o?.paymentStatus !== 'paid' && !['cancelled', 'completed'].includes(o?.status)).length;
    return [
      { key: 'seller.toSend', label: 'Oda za kutuma', count: toSend, destination: 'SellerOrders', tone: 'blue' },
      { key: 'seller.lipa', label: 'Malipo ya Lipa Namba ya kuthibitisha', count: lipa, destination: 'SellerOrders', tone: 'amber' },
    ];
  },
  super_agent: async (api) => {
    const [send, incoming] = await Promise.all([
      api.get('/super-agents/bulk-shipments/candidates').then((r) => count(r.data)).catch(() => 0),
      api.get('/pickup-tasks/hub/expected').then((r) => count(r.data)).catch(() => 0),
    ]);
    return [
      { key: 'office.incoming', label: 'Mizigo inayokuja (POKEA)', count: incoming, destination: 'SuperAgentDashboard', tone: 'blue' },
      { key: 'office.send', label: 'Mizigo ya kutuma (TUMA)', count: send, destination: 'SuperAgentDashboard', tone: 'amber' },
    ];
  },
  agent: async (api) => {
    const [available, mine] = await Promise.all([
      api.get('/pickup-tasks/available').then((r) => count(r.data)).catch(() => 0),
      api.get('/pickup-tasks/mine').then((r) => asList(r.data).filter((t) => ['claimed', 'collected', 'awaiting_hub'].includes(t?.status)).length).catch(() => 0),
    ]);
    return [
      { key: 'agent.doing', label: 'Kazi unazofanya sasa', count: mine, destination: 'AgentDashboard', tone: 'amber' },
      { key: 'agent.available', label: 'Kazi mpya karibu nawe', count: available, destination: 'AgentDashboard', tone: 'blue' },
    ];
  },
  transport_provider: async (api) => [
    { key: 'transport.quotes', label: 'Maombi ya bei ya kujibu', count: unansweredQuotes((await api.get('/quote-requests/inbox')).data), destination: 'QuoteInbox', tone: 'blue' },
  ],
  service_provider: async (api) => [
    { key: 'service.quotes', label: 'Maombi ya bei ya kujibu', count: unansweredQuotes((await api.get('/quote-requests/inbox')).data), destination: 'QuoteInbox', tone: 'blue' },
  ],
});

/** The account's own items: messages and deliveries to confirm. */
export async function personalAttention(api, { inboxUnread = 0 } = {}) {
  const toConfirm = await api.get('/orders/my-orders')
    .then((r) => asList(r.data).filter((o) => o?.status === 'delivered').length)
    .catch(() => 0);
  return [
    { key: 'me.inbox', label: 'Ujumbe mpya', count: Number(inboxUnread) || 0, destination: 'SellerInbox', tone: 'blue' },
    { key: 'me.confirm', label: 'Thibitisha umepokea oda', count: toConfirm, destination: 'MyOrders', tone: 'amber' },
  ].filter((i) => i.count > 0);
}

/** The active role's items (empty for a role with no source, or when every source fails). */
export async function roleAttention(api, roleType, ctx = {}) {
  const source = ROLE_ATTENTION[roleType];
  if (!source) return [];
  try {
    const items = await source(api, ctx);
    return (items || []).filter((i) => Number(i.count) > 0);
  } catch {
    return [];
  }
}
