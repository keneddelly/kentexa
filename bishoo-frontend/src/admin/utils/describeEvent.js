/**
 * describeEvent.js: one recorded event in plain Swahili for the admin (owner 2026-11-09: "admin
 * recognizes each action taken by user"). Named events have their own words; a recorded ACTION
 * (any change: method + route) is read from its route, e.g. PATCH /orders/:id/cancel ->
 * "amesitisha oda #12". Unknown ones still show their route, never nothing.
 */
const NAMED = {
  ORDER_PLACED: 'ameweka oda', ORDER_CREATED: 'oda imeundwa', ORDER_PAID: 'oda imelipwa', ORDER_PAID_COD: 'oda imelipwa (COD)',
  ORDER_COMPLETED: 'oda imekamilika', ORDER_DELIVERED: 'oda imefika', ORDER_CANCELLED: 'oda imesitishwa', OUT_FOR_DELIVERY: 'oda iko njiani',
  MOMENT_CREATED: 'ameweka Moment', MOMENT_EDITED: 'amebadilisha Moment', MOMENT_REPORTED: 'ameripoti Moment', MOMENT_STATUS_CHANGED: 'hali ya Moment imebadilika',
  MOMENT_NEED_MATCHED: 'Moment imeunganishwa na hitaji', POLL_VOTED: 'amepiga kura', TOPICS_FOLLOWED: 'amefuata mada',
  COMMUNITY_CREATED: 'amefungua jumuiya', COMMUNITY_JOINED: 'amejiunga na jumuiya', COMMUNITY_LEFT: 'ameondoka jumuiya', COMMUNITY_POST_REMOVED: 'chapisho la jumuiya limeondolewa',
  BUSINESS_CREATED: 'amefungua biashara', PROFILE_CREATED: 'ameunda wasifu', PROFILE_MUTED: 'amenyamazisha wasifu',
  INVOICE_CREATED: 'ameunda ankara', INVOICE_PAID: 'ankara imelipwa', PAYMENT_MANUALLY_CONFIRMED: 'malipo yamethibitishwa kwa mkono',
  SHIPMENT_PAYMENT_RECORDED: 'malipo ya mzigo yamerekodiwa', SHIPPING_PROOF_UPLOADED: 'ushahidi wa kutuma umewekwa',
  PARCEL_DISPATCHED: 'mzigo umetumwa', PARCEL_DELIVERED: 'mzigo umefika', PARCEL_MARKED_STILL_HERE: 'mzigo bado uko ofisini',
  LOGISTICS_PICKUP_AVAILABLE: 'kazi ya kuchukua mzigo imetolewa', LOGISTICS_PICKUP_CANCELLED: 'kazi ya kuchukua imesitishwa',
  LOGISTICS_PICKUP_RELEASED: 'kazi ya kuchukua imerudishwa', LOGISTICS_PICKUP_REMINDER: 'mawakala wamekumbushwa',
  COD_BALANCE_COLLECTED: 'pesa ya COD imekusanywa', COMMISSION_EARNED: 'kamisheni imepatikana', EARNINGS_RELEASED: 'mapato yametolewa',
  REVIEW_CREATED: 'ameandika maoni', WARRANTY_REGISTERED: 'amesajili dhamana', WARRANTY_CLAIM_FILED: 'amedai dhamana',
  DUPLICATE_SERIAL_REGISTRATION_ATTEMPT: 'jaribio la namba ya bidhaa iliyokwisha sajiliwa',
  REFERRAL_QUALIFIED: 'rufaa imekubalika', REFERRAL_REJECTED_FRAUD: 'rufaa imekataliwa (udanganyifu)',
  IDENTITY_MARKED_CHECKED_BY_ADMIN: 'kitambulisho kimewekwa "kimeangaliwa" na admin', SELLER_CHECKOUT_NOTICE: 'muuzaji ameambiwa kuhusu oda',
  DIGITAL_PRODUCT_CREATED: 'ameunda bidhaa ya kidijitali', DIGITAL_PRODUCT_DELIVERED: 'bidhaa ya kidijitali imetolewa',
  AI_RECOMMENDATION_GENERATED: 'AI imetoa pendekezo',
};

const NOUN = {
  orders: 'oda', products: 'bidhaa', classifieds: 'tangazo', services: 'huduma', shipments: 'mzigo', 'pickup-tasks': 'kazi ya kuchukua',
  'super-agents': 'ofisi', agents: 'wakala', business: 'biashara', 'commerce-profiles': 'wasifu', seller: 'duka', users: 'mtumiaji',
  identity: 'kitambulisho', payments: 'malipo', payouts: 'malipo kwa muuzaji', invoices: 'ankara', disputes: 'mgogoro', feed: 'Moment',
  auth: 'KenteXa', communities: 'jumuiya', conversations: 'mazungumzo', transport: 'usafiri', 'team-invitations': 'mwaliko wa timu', 'food-orders': 'oda ya chakula',
  'quote-requests': 'ombi la bei', reviews: 'maoni', contact: 'ujumbe', brands: 'chapa', warranty: 'dhamana', 'kentexa-fee': 'ada ya KenteXa',
};

const VERB_BY_LAST = {
  login: 'ameingia', register: 'amejisajili', logout: 'ametoka', approve: 'ameidhinisha', reject: 'amekataa', cancel: 'amesitisha',
  claim: 'amekubali', collect: 'amechukua', deliver: 'amefikisha', confirm: 'amethibitisha', pay: 'amelipa', apply: 'ameomba',
  submit: 'ametuma', suspend: 'amesimamisha', restore: 'amerejesha', release: 'ameachia', remind: 'amekumbusha', follow: 'amefuata',
  unfollow: 'ameacha kufuata', like: 'amependa', react: 'amejibu kwa hisia', comment: 'ametoa maoni', vote: 'amepiga kura', send: 'ametuma',
  accept: 'amekubali', decline: 'amekataa', invite: 'amealika', receive: 'amepokea', dispatch: 'ametuma', verify: 'amethibitisha',
  'connect-selling': 'ameomba kuuza', 'approve-without-id': 'ameidhinisha bila kitambulisho', 'approve-legacy-without-id': 'ameidhinisha bila kitambulisho',
};
const VERB_BY_METHOD = { POST: 'ameunda', PATCH: 'amebadilisha', PUT: 'amebadilisha', DELETE: 'amefuta' };

export function describeEvent(e) {
  if (!e) return '';
  if (e.eventType !== 'ACTION') return NAMED[e.eventType] || String(e.eventType || '').toLowerCase().replace(/_/g, ' ');
  const m = e.metadata || {};
  const parts = String(m.route || '').replace(/^\/+/, '').split('/').filter(Boolean);
  const noun = NOUN[parts[0]] || parts[0] || 'kitu';
  const last = [...parts].reverse().find((p) => !p.startsWith(':')) || '';
  const verb = (last !== parts[0] && VERB_BY_LAST[last]) || VERB_BY_LAST[parts[1]] || VERB_BY_METHOD[m.method] || 'amefanya';
  const id = e.targetId ? ` #${e.targetId}` : '';
  return `${verb} ${noun}${id}`;
}

export const CATEGORY_LABEL = {
  AUTH: 'Kuingia', IDENTITY: 'Akaunti', VERIFICATION: 'Vitambulisho', BUSINESS: 'Biashara', SOCIAL: 'Jamii', CONTENT: 'Bidhaa na matangazo',
  SEARCH: 'Utafutaji', MESSAGING: 'Ujumbe', COMMERCE: 'Oda', PAYMENT: 'Malipo', INVOICE: 'Ankara', LOGISTICS: 'Usafirishaji',
  AGENT: 'Mawakala', TRANSPORT: 'Usafiri', REPUTATION: 'Maoni', SECURITY: 'Usalama', SYSTEM: 'Mfumo / admin', AI: 'AI',
};
