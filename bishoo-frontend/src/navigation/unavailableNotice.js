// What to tell the person when a page cannot open (owner 2026-11-09 audit: "navigation silently
// redirects to Home"). Plain Swahili; null means nothing to say (the login page explains itself).
const ROLE_NAME = {
  seller: 'Muuzaji', agent: 'Agent', super_agent: 'Ofisi', transport_provider: 'Usafiri',
  service_provider: 'Mtoa huduma', admin: 'Admin', manager: 'Meneja', customer_care: 'Huduma kwa wateja',
  finance: 'Fedha', moderator: 'Mkaguzi',
};

export function unavailableNotice(decision) {
  if (!decision || decision.allowed) return null;
  if (decision.reason === 'AUTHENTICATION_REQUIRED' || decision.reason === 'STALE_HISTORY') return null;
  if (decision.reason === 'UNKNOWN_DESTINATION') {
    return { text: 'Ukurasa huu haupo tena. Tumekurudisha mwanzo.', canSwitch: false };
  }
  const roles = decision.destination?.roles || [];
  const names = roles.map((r) => ROLE_NAME[r]).filter(Boolean);
  if (decision.reason === 'WRONG_CONTEXT' && names.length) {
    return { text: `Ukurasa huu ni wa kazi ya ${names.join(' au ')}. Badilisha kazi, kisha uufungue tena.`, canSwitch: true };
  }
  return { text: 'Ukurasa huu haupatikani kwa kazi uliyo nayo sasa. Badilisha kazi, kisha uufungue tena.', canSwitch: true };
}
