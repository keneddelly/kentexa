// "Unataka kufanya nini KenteXa?" (owner 2026-11-09): what the person said they want to do, chosen
// at the welcome and kept in User.onboardingState.goals. Kazi shows the ones not done yet, each
// opening its short form. `done` reads the person's real roles and businesses, never a guess.
const has = (roles, type, statuses = ['active', 'pending']) => (roles || []).some((r) => r.roleType === type && statuses.includes(String(r.status || 'active')));

export const GOALS = [
  { key: 'buy', label: 'Kununua na kugundua', hint: 'Bidhaa, huduma na biashara za karibu', page: 'Discover', done: () => true },
  { key: 'sell', label: 'Kuuza bidhaa', hint: 'Fungua duka lako', page: 'BecomeSeller', done: ({ roles }) => has(roles, 'seller') },
  { key: 'service', label: 'Kutoa huduma', hint: 'Fundi, usafi, ushauri na zaidi', page: 'PostService', done: ({ roles }) => has(roles, 'service_provider') },
  { key: 'business', label: 'Kufungua biashara', hint: 'Ukurasa wa kampuni au shirika', page: 'BecomeBusiness', done: ({ businesses }) => (businesses || []).length > 0 },
  { key: 'office', label: 'Kufungua ofisi ya mizigo', hint: 'Pokea na tuma mizigo ya wateja', page: 'BecomeSuperAgentInfo', done: ({ roles }) => has(roles, 'super_agent') },
  { key: 'agent', label: 'Kuwa agent', hint: 'Chukua na fikisha mizigo mtaani', page: 'BecomeAgent', done: ({ roles }) => has(roles, 'agent') },
  { key: 'transport', label: 'Kusajili usafiri', hint: 'Gari, basi au lori la mizigo', page: 'BecomeTransportProvider', done: ({ roles }) => has(roles, 'transport_provider') },
  { key: 'send', label: 'Kutuma mizigo', hint: 'Tuma mzigo popote Tanzania', page: 'SendShipment', done: () => true },
];

export const goalByKey = (k) => GOALS.find((g) => g.key === k);

/** The chosen goals still to finish: they need a form (a role or a business) that is not there yet. */
export const goalsToFinish = (goals, ctx) => (Array.isArray(goals) ? goals : [])
  .map(goalByKey).filter(Boolean).filter((g) => !g.done(ctx || {}));
