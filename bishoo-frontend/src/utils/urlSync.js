// Maps between the app's internal page router state and shareable browser paths.
const PREFIX_TO_SEGMENT = {
  ProductDetail: 'product',
  ClassifiedDetail: 'classified',
  ServiceDetail: 'service',
  CommerceProfile: 'store',
  PostDetail: 'post',
  Category: 'category',
};
const SEGMENT_TO_PREFIX = Object.fromEntries(
  Object.entries(PREFIX_TO_SEGMENT).map(([prefix, segment]) => [segment, prefix])
);
const STATIC_PATHS = { UzaTena: '/uza-tena', PrivacyPolicy: '/privacy', Terms: '/terms' };

export const pageToPath = (page, navParams) => {
  if (typeof page !== 'string') return null;
  if (STATIC_PATHS[page]) return STATIC_PATHS[page];
  for (const prefix of Object.keys(PREFIX_TO_SEGMENT)) {
    if (!page.startsWith(`${prefix}-`)) continue;
    const id = page.slice(prefix.length + 1).split('-')[0];
    if (prefix === 'Category') return /^[a-z0-9_]+$/i.test(id) ? `/category/${id.toLowerCase()}` : null;
    if (!/^\d+$/.test(id)) return null;
    const path = `/${PREFIX_TO_SEGMENT[prefix]}/${id}`;
    if (prefix === 'CommerceProfile' && navParams?.commerceProfileId) return `${path}?cp=${navParams.commerceProfileId}`;
    return path;
  }
  return null;
};

export const pathToPage = (pathname) => {
  const cleanPath = String(pathname || '').replace(/\/+$/, '') || '/';
  const fixed = Object.keys(STATIC_PATHS).find((key) => STATIC_PATHS[key] === cleanPath);
  if (fixed) return fixed;
  const categoryMatch = cleanPath.match(/^\/category\/([a-z0-9_]+)$/i);
  if (categoryMatch) return `Category-${categoryMatch[1].toLowerCase()}`;
  const match = cleanPath.match(/^\/(product|classified|service|store|post)\/(\d+)(?:-[a-z0-9-]*)?\/?$/i);
  if (!match) return null;
  const [, segment, id] = match;
  return `${SEGMENT_TO_PREFIX[segment]}-${id}`;
};

export const pathToNavParams = (pathname, search) => {
  if (!/^\/store\/\d+$/.test(String(pathname || ''))) return null;
  const cp = new URLSearchParams(search || '').get('cp');
  return cp && /^\d+$/.test(cp) ? { commerceProfileId: Number(cp) } : null;
};

export const linkPageFromAddress = (loc = typeof window !== 'undefined' ? window.location : null) => {
  try { return loc ? pathToPage(loc.pathname) : null; } catch { return null; }
};
