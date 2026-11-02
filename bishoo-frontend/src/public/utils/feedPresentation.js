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
