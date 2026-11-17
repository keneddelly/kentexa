// Feed trays (owner approved 2026-11-16: "that will make KenteXa awake"). After every 2 posts one
// tray, in this order; a tray with nothing to show is skipped (the next one takes its place), the
// same kind never comes twice in a row, and with a single kind it shows once.
export const TRAY_ORDER = Object.freeze([
  'products', 'communities', 'services', 'articles', 'series', 'classifieds', 'questions', 'stores',
  'transport', 'polls', 'offices', 'hotels', 'agents', 'providers', 'hashtags',
]);
export const POSTS_BETWEEN_TRAYS = 2;
// The tabs that get trays (topic chips stay focused on their topic).
export const TRAY_TABS = Object.freeze(['for_you', 'following', 'nearby']);

/**
 * Which tray goes after each post: { [postIndex]: trayKey }. `available` = the tray kinds that have
 * something to show. A feed shorter than 2 posts still gets one tray after its last post.
 */
export function traySlots(postCount, available) {
  const kinds = TRAY_ORDER.filter((k) => available.includes(k));
  const slots = {};
  if (!kinds.length || postCount <= 0) return slots;
  let n = 0;
  for (let i = 0; i < postCount; i += 1) {
    const after = (i + 1) % POSTS_BETWEEN_TRAYS === 0 || (postCount < POSTS_BETWEEN_TRAYS && i === postCount - 1);
    if (!after) continue;
    if (kinds.length === 1 && n >= 1) break;
    slots[i] = kinds[n % kinds.length];
    n += 1;
  }
  return slots;
}
