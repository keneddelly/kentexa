// Maps between the app's internal page router state and shareable browser paths.
import { hashtagKey } from '../public/utils/hashtags';
const PREFIX_TO_SEGMENT = {
  ProductDetail: 'product',
  ClassifiedDetail: 'classified',
  ServiceDetail: 'service',
  CommerceProfile: 'store',
  PostDetail: 'post',
  // One navigation (owner 2026-11-16, #374): a community has its own address.
  Community: 'community',
  Category: 'category',
  // Mfululizo (#410): a series has its own address, /series/<id>.
  Series: 'series',
};
const SEGMENT_TO_PREFIX = Object.fromEntries(
  Object.entries(PREFIX_TO_SEGMENT).map(([prefix, segment]) => [segment, prefix])
);
const STATIC_PATHS = { UzaTena: '/uza-tena', StartSelling: '/start-selling', PrivacyPolicy: '/privacy', Terms: '/terms' };

export const pageToPath = (page, navParams) => {
  if (typeof page !== 'string') return null;
  if (STATIC_PATHS[page]) return STATIC_PATHS[page];
  // Mfululizo (#410): a topic's page, kentexa.com/topic/<key>.
  if (page.startsWith('Topic-')) {
    const key = page.slice(6).toLowerCase();
    return /^[a-z_]{2,40}$/.test(key) ? `/topic/${key}` : null;
  }
  // Hashtags (owner 2026-11-15): a tag's page, kentexa.com/tag/<key>.
  if (page.startsWith('Tag-')) {
    const key = hashtagKey(page.slice(4));
    return key ? `/tag/${encodeURIComponent(key)}` : null;
  }
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
  const tagMatch = cleanPath.match(/^\/tag\/([^/]+)$/i);
  if (tagMatch) {
    let raw = tagMatch[1];
    try { raw = decodeURIComponent(raw); } catch { return null; }
    const key = hashtagKey(raw);
    return key ? `Tag-${key}` : null;
  }
  const topicMatch = cleanPath.match(/^\/topic\/([a-z_]{2,40})$/i);
  if (topicMatch) return `Topic-${topicMatch[1].toLowerCase()}`;
  const categoryMatch = cleanPath.match(/^\/category\/([a-z0-9_]+)$/i);
  if (categoryMatch) return `Category-${categoryMatch[1].toLowerCase()}`;
  // Every other page (owner 2026-11-16, #374): /p/<PageName>, so a refresh stays on it.
  const anyPage = cleanPath.match(/^\/p\/([A-Za-z][A-Za-z0-9_.:-]{0,120})$/);
  if (anyPage) return anyPage[1];
  const match = cleanPath.match(/^\/(product|classified|service|store|post|community|series)\/(\d+)(?:-[a-z0-9-]*)?\/?$/i);
  if (!match) return null;
  const [, segment, id] = match;
  return `${SEGMENT_TO_PREFIX[segment]}-${id}`;
};

/**
 * The address for ANY page (owner 2026-11-16, #374): the shareable one when it has one,
 * '/' for Home, else /p/<PageName>. Every page then has its own browser history entry.
 */
export const pageToAddress = (page, navParams) => {
  if (typeof page !== 'string' || !page) return null;
  if (page === 'Home') return '/';
  const path = pageToPath(page, navParams);
  if (path) return path;
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,120}$/.test(page) ? `/p/${page}` : null;
};

export const pathToNavParams = (pathname, search) => {
  if (!/^\/store\/\d+$/.test(String(pathname || ''))) return null;
  const cp = new URLSearchParams(search || '').get('cp');
  return cp && /^\d+$/.test(cp) ? { commerceProfileId: Number(cp) } : null;
};

/** A seller's invitation to an office or a transporter (?join=office | ?join=transport). */
export const JOIN_LINK_PAGE = { office: 'BecomeSuperAgentInfo', transport: 'BecomeTransportProvider' };
export const joinPageFromSearch = (search) => {
  try { return JOIN_LINK_PAGE[new URLSearchParams(search || '').get('join')] || null; } catch { return null; }
};

export const linkPageFromAddress = (loc = typeof window !== 'undefined' ? window.location : null) => {
  // Owner 2026-11-17: kentexa.com/?join=office opens the office application even when signed in.
  // Never the login page itself: a signed-in person who reloads on it goes to their home.
  try {
    const page = loc ? (pathToPage(loc.pathname) || joinPageFromSearch(loc.search)) : null;
    return page === 'PublicLogin' || page === 'Register' ? null : page;
  } catch { return null; }
};
