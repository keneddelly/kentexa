/**
 * accountGate.js — owner 2026-11-17: an account made with Google / Facebook or email has no phone
 * (and may have no town). Before a feature that needs them starts (selling, sending a parcel,
 * offices, agents, transport, services, checkout), the person adds them once, so the feature never
 * fails half-way. Reading, communities, Makala and Mfululizo never ask.
 */
export const NEEDS_PHONE_PAGES = new Set([
  'BecomeSeller', 'BecomeSuperAgentInfo', 'BecomeAgent', 'BecomeTransportProvider', 'BecomeBusiness',
  'SendShipment', 'PostService', 'CreateClassified', 'Checkout', 'UzaTena', 'MyResales',
]);

/** What a signed-in person still has to add before opening `page`: [] when nothing. */
export const missingForPage = (page, user) => {
  if (!user || !NEEDS_PHONE_PAGES.has(String(page || '').split('-')[0])) return [];
  const missing = [];
  if (!String(user.phone || '').trim()) missing.push('phone');
  if (!String(user.city || '').trim()) missing.push('city');
  return missing;
};

export const TZ_REGIONS = [
  'Dar es Salaam', 'Arusha', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara',
  'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pemba Kaskazini', 'Pemba Kusini', 'Pwani', 'Rukwa', 'Ruvuma',
  'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Unguja Kaskazini', 'Unguja Kusini', 'Mjini Magharibi',
];
