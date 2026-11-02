// Home Feed Phase B presentation helpers (owner 2026-11-01). Pure: no data, no authority.

/** A photo's frame: its own width/height, kept between portrait 4:5 and wide 16:9 (Phase B). */
export const photoAspect = (ratio) => {
  if (!ratio || !Number.isFinite(ratio)) return '4 / 3';
  const r = Math.min(16 / 9, Math.max(4 / 5, ratio));
  return `${Math.round(r * 1000)} / 1000`;
};

/** The line under a Moment's name: who is posting, in plain words (Phase B). */
export const momentRoleLine = (moment) => {
  if (moment?.postType === 'looking_for') return 'Anatafuta';
  // The server's actor kind (moment-actor.ts): PERSONAL, BUSINESS or OTHER.
  if (moment?.business?.actorType === 'BUSINESS') return 'Biashara';
  return '';
};

const siteOrigin = () => (typeof window !== 'undefined' && /kentexa\.com$/.test(window.location.hostname)
  ? window.location.origin : 'https://kentexa.com');

/**
 * Phase C (owner 2026-11-02): the link a share sends. A real post opens its own page
 * (/post/:id); a listing shown in the feed without a post opens that listing's page.
 */
export const postShareUrl = (post, entityType, entityId) => {
  if (/^\d+$/.test(String(post?.id ?? ''))) return `${siteOrigin()}/post/${post.id}`;
  const seg = { product: 'product', service: 'service', new_service: 'service', classified: 'classified' }[entityType];
  if (seg && /^\d+$/.test(String(entityId ?? ''))) return `${siteOrigin()}/${seg}/${entityId}`;
  return siteOrigin();
};

// ── Phase D (owner approved 2026-11-02): the composer and what it makes ────────

export const COMPOSER = Object.freeze({ text: 500, photos: 4, editMinutes: 15 });

/** The kinds of post the composer offers ("Kura" comes with phase E). */
export const POST_KINDS = Object.freeze([
  { key: 'moment', label: 'Moment', intent: 'update' },
  { key: 'question', label: 'Swali', intent: 'question' },
  { key: 'discussion', label: 'Mjadala', intent: 'discussion' },
  { key: 'showcase', label: 'Onyesha bidhaa', intent: 'sell_available', needsItem: true },
  { key: 'offer', label: 'Ofa', intent: 'offer', needsItem: true },
  { key: 'looking_for', label: 'Natafuta' },
]);

/** A post's photos: its media list, or the single imageUrl of a post made before phase D. */
export const postPhotos = (post) => {
  const media = Array.isArray(post?.media) ? post.media.filter((m) => m && m.url) : [];
  if (media.length) return media.slice(0, COMPOSER.photos);
  return post?.imageUrl ? [{ url: post.imageUrl, width: null, height: null }] : [];
};

/** The tag a post shows for its format (empty for a plain Moment). */
export const formatTag = (intent) => ({ question: 'Swali', discussion: 'Mjadala', offer: 'Ofa' }[intent] || '');

/** The author may edit within 15 minutes of publishing (the server checks the same). */
export const canEditPost = (post, userId, now = Date.now()) => {
  if (!post || !userId || !/^\d+$/.test(String(post.id ?? ''))) return false;
  const owner = post.businessId ?? post.business?.id;
  if (Number(owner) !== Number(userId)) return false;
  const created = Date.parse(post.createdAt);
  return Number.isFinite(created) && now - created <= COMPOSER.editMinutes * 60 * 1000;
};
