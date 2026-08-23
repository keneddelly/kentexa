// Maps between the app's internal `page` router state (e.g. 'ProductDetail-42')
// and real, shareable browser paths (e.g. '/product/42'). Only these 4
// content types get a synced URL — every other page intentionally keeps
// today's behavior (no URL change) so this is purely additive and can't
// regress any other navigation.
const PREFIX_TO_SEGMENT = {
  ProductDetail: 'product',
  ClassifiedDetail: 'classified',
  ServiceDetail: 'service',
  CommerceProfile: 'store',
};

const SEGMENT_TO_PREFIX = Object.fromEntries(
  Object.entries(PREFIX_TO_SEGMENT).map(([prefix, segment]) => [segment, prefix])
);

// page -> path, or null if this page isn't one of the synced types.
// CommerceProfile.js can't tell WHICH of an account's profiles
// (personal/business/hub/transport) to show from a bare user id alone —
// it needs the explicit commerceProfileId every in-app link already passes
// it (navParams.commerceProfileId), or it silently falls back to showing
// the owner's PERSONAL profile. Carry it as ?cp= so a pushed/shared /store
// URL reloads into the same specific profile instead of that fallback.
export const pageToPath = (page, navParams) => {
  if (typeof page !== 'string') return null;
  for (const prefix of Object.keys(PREFIX_TO_SEGMENT)) {
    if (page.startsWith(`${prefix}-`)) {
      const rest = page.slice(prefix.length + 1);
      // Some prefixes carry extra "-suffix" data (e.g. ProductDetail-42-comments)
      // — only the numeric id segment maps into the clean URL.
      const id = rest.split('-')[0];
      if (!/^\d+$/.test(id)) return null;
      const path = `/${PREFIX_TO_SEGMENT[prefix]}/${id}`;
      if (prefix === 'CommerceProfile' && navParams?.commerceProfileId) {
        return `${path}?cp=${navParams.commerceProfileId}`;
      }
      return path;
    }
  }
  return null;
};

// pathname -> page, or null if it doesn't match a synced route.
export const pathToPage = (pathname) => {
  const match = String(pathname || '').match(/^\/(product|classified|service|store)\/(\d+)$/);
  if (!match) return null;
  const [, segment, id] = match;
  return `${SEGMENT_TO_PREFIX[segment]}-${id}`;
};

// Reads the ?cp= companion param for a /store/:id URL, if present.
export const pathToNavParams = (pathname, search) => {
  if (!/^\/store\/\d+$/.test(String(pathname || ''))) return null;
  const cp = new URLSearchParams(search || '').get('cp');
  return cp && /^\d+$/.test(cp) ? { commerceProfileId: Number(cp) } : null;
};
