// Home feed product trail: a horizontal row of listing cards placed between feed posts.
//
// Slots: one slot after every 2 posts. Odd slots (after posts 2, 6, 10…) are the product
// trail, even slots (after 4, 8, 12…) keep the older discovery rail with all its types.
// The trail never sits at the start or end of the feed. The older rail keeps its own
// rule for a thin feed (under 4 posts): one rail after the last post.
//
// Rotation: listings come from all products + active classifieds, no approval step.
// Consecutive trails never share an item, and a user's newest trail prefers items
// that user has not been shown yet (remembered per user in localStorage).
//
// Boost-ready: every trail carries `boosted` and `slot_source` (default organic) so a
// paid slot can be added later without touching the layout. No payment logic here.

export const POSTS_PER_SLOT = 2;
export const TRAIL_SIZE = 8;
export const SLOT_SOURCE = Object.freeze({ ORGANIC: 'organic', BOOST: 'boost' });
// The older rail, unchanged: trending products, classifieds, services, stores, transport.
export const DISCOVERY_RAIL_TYPES = ['product', 'classified', 'service', 'store', 'transport'];
const THIN_FEED = 4;

const SEEN_LIMIT = 200;
const seenKey = (userKey) => `kentexa_trail_seen_${userKey || 'guest'}`;

/**
 * What to render after the post at `index` (0-based) in a feed of `postCount` posts:
 * null, { kind: 'product_trail', trailIndex }, or { kind: 'discovery_rail', railType }.
 */
export function slotAfterPost(index, postCount) {
  if (index < 0 || index >= postCount) return null;
  if (index === postCount - 1) {
    // No trail at the end; a thin feed still gets the older rail's one guaranteed slot.
    return postCount < THIN_FEED ? { kind: 'discovery_rail', railType: DISCOVERY_RAIL_TYPES[0] } : null;
  }
  if ((index + 1) % POSTS_PER_SLOT !== 0) return null;
  const slot = (index + 1) / POSTS_PER_SLOT; // 1, 2, 3…
  if (slot % 2 === 1) return { kind: 'product_trail', trailIndex: (slot - 1) / 2 };
  const railIndex = slot / 2 - 1;
  return { kind: 'discovery_rail', railType: DISCOVERY_RAIL_TYPES[railIndex % DISCOVERY_RAIL_TYPES.length] };
}

/** Products and active classifieds as one list of trail items. */
export function buildTrailPool(products = [], classifieds = []) {
  const items = [];
  (Array.isArray(products) ? products : []).forEach((p) => {
    if (!p?.id || p.isAvailable === false) return;
    items.push({
      key: `product-${p.id}`, entityType: 'product', id: p.id,
      name: p.name || '', image: p.images?.[0] || null,
      price: Number(p.displayPrice || p.basePrice || 0),
      codEnabled: !!p.codEnabled, freeDelivery: !Number(p.deliveryFee || 0),
      cartable: true, raw: p,
    });
  });
  (Array.isArray(classifieds) ? classifieds : []).forEach((c) => {
    if (!c?.id || c.status !== 'active') return;
    const flash = c.isFlashSale && c.flashSalePrice;
    items.push({
      key: `classified-${c.id}`, entityType: 'classified', id: c.id,
      name: c.title || '', image: c.images?.[0] || null,
      price: Number(flash ? c.flashSalePrice : c.price || 0),
      codEnabled: false, freeDelivery: false, delivery: !!c.deliveryMethod,
      cartable: false, raw: c,
    });
  });
  return items;
}

const shuffle = (list, random) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const readSeen = (storage, userKey) => {
  try { const v = JSON.parse(storage?.getItem(seenKey(userKey)) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const writeSeen = (storage, userKey, keys) => {
  try { storage?.setItem(seenKey(userKey), JSON.stringify(keys.slice(-SEEN_LIMIT))); } catch { /* private mode */ }
};

/**
 * A per-user rotation over `pool`. trailAt(i) is stable for the session (same i, same
 * trail); markSeen(trail) records what the user was shown so the next trail, and the
 * next visit, starts with items they have not seen.
 */
export function createTrailRotation(pool, { userKey, storage, size = TRAIL_SIZE, random = Math.random } = {}) {
  const trails = [];
  // Two consecutive trails must not overlap, so a small pool gets smaller trails.
  const trailSize = Math.max(0, Math.min(size, Math.floor(pool.length / 2) || pool.length));
  let lastShown = new Set(readSeen(storage, userKey).slice(-trailSize));

  const next = () => {
    const previous = trails.length ? new Set(trails[trails.length - 1].items.map((i) => i.key)) : lastShown;
    const seen = new Set(readSeen(storage, userKey));
    const allowed = pool.filter((item) => !previous.has(item.key));
    const unseen = shuffle(allowed.filter((item) => !seen.has(item.key)), random);
    const rest = shuffle(allowed.filter((item) => seen.has(item.key)), random);
    const items = [...unseen, ...rest].slice(0, trailSize);
    const trail = {
      id: `trail-${trails.length}`,
      kind: 'product_trail',
      boosted: false,
      slot_source: SLOT_SOURCE.ORGANIC,
      items,
    };
    trails.push(trail);
    return trail;
  };

  return {
    trailSize,
    trailAt(index) {
      while (trails.length <= index) next();
      return trails[index];
    },
    markSeen(trail) {
      if (!trail?.items?.length) return;
      const seen = readSeen(storage, userKey).filter((k) => !trail.items.some((i) => i.key === k));
      let updated = [...seen, ...trail.items.map((i) => i.key)];
      // Everything seen: start a new round, keeping only this trail so it is not repeated next.
      if (pool.every((item) => updated.includes(item.key))) updated = trail.items.map((i) => i.key);
      writeSeen(storage, userKey, updated);
      lastShown = new Set(trail.items.map((i) => i.key));
    },
  };
}
