import { slotAfterPost, buildTrailPool, createTrailRotation, SLOT_SOURCE } from './productTrail';

const slotsFor = (n) => Array.from({ length: n }, (_, i) => slotAfterPost(i, n));
const positions = (n, kind) => slotsFor(n).map((s, i) => (s?.kind === kind ? i + 1 : null)).filter(Boolean);

const memoryStorage = () => {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const pool = (n) => buildTrailPool(
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, basePrice: 1000, images: [] })),
  [],
);

describe('insertion rule', () => {
  test('a slot after every 2 posts: trail after 2, 6, 10…, the old rail after 4, 8, 12…', () => {
    expect(positions(13, 'product_trail')).toEqual([2, 6, 10]);
    expect(positions(13, 'discovery_rail')).toEqual([4, 8, 12]);
    expect(slotsFor(13).filter(Boolean).map((s) => s.railType).filter(Boolean)).toEqual(['product', 'classified', 'service']);
  });

  test('the old rail keeps all its types in turn', () => {
    expect(slotsFor(41).filter(Boolean).map((s) => s.railType).filter(Boolean))
      .toEqual(['product', 'classified', 'service', 'store', 'transport', 'product', 'classified', 'service', 'store', 'transport']);
  });

  test('no trail at the start or after the last post of a short feed', () => {
    expect(slotsFor(0)).toEqual([]);
    expect(positions(1, 'product_trail')).toEqual([]);
    expect(positions(2, 'product_trail')).toEqual([]); // the only slot would be the end
    expect(positions(3, 'product_trail')).toEqual([2]);
    expect(positions(4, 'product_trail')).toEqual([2]);
    expect(positions(4, 'discovery_rail')).toEqual([]); // after post 4 is the end of a 4-post feed
    expect(slotAfterPost(0, 10)).toBeNull();
  });

  test('a thin feed (under 4 posts) still gets the old rail once, after its last post', () => {
    expect(slotsFor(1)).toEqual([{ kind: 'discovery_rail', railType: 'product' }]);
    expect(positions(2, 'discovery_rail')).toEqual([2]);
    expect(positions(3, 'discovery_rail')).toEqual([3]);
    expect(positions(3, 'product_trail')).toEqual([2]);
  });

  test('trails are numbered in order for the rotation', () => {
    expect(slotsFor(11).filter((s) => s?.kind === 'product_trail').map((s) => s.trailIndex)).toEqual([0, 1, 2]);
  });
});

describe('pool', () => {
  test('products and active classifieds only; unavailable products and inactive ads are out', () => {
    const items = buildTrailPool(
      [{ id: 1, name: 'A', basePrice: 5, codEnabled: true }, { id: 2, name: 'B', isAvailable: false }],
      [{ id: 7, title: 'Ad', price: 9, status: 'active' }, { id: 8, title: 'Old', status: 'expired' }],
    );
    expect(items.map((i) => i.key)).toEqual(['product-1', 'classified-7']);
    expect(items[0]).toEqual(expect.objectContaining({ cartable: true, codEnabled: true, price: 5 }));
    expect(items[1]).toEqual(expect.objectContaining({ cartable: false, price: 9 }));
  });
});

describe('rotation', () => {
  const keys = (trail) => trail.items.map((i) => i.key);
  const overlap = (a, b) => keys(a).filter((k) => keys(b).includes(k));

  test('consecutive trails for the same user never repeat an item', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const rot = createTrailRotation(pool(20), { userKey: 5, storage: memoryStorage() });
      for (let i = 1; i < 6; i += 1) expect(overlap(rot.trailAt(i - 1), rot.trailAt(i))).toEqual([]);
    }
  });

  test('a small pool gets smaller trails so consecutive ones still do not overlap', () => {
    const rot = createTrailRotation(pool(5), { userKey: 5, storage: memoryStorage() });
    expect(rot.trailSize).toBe(2);
    for (let i = 1; i < 6; i += 1) expect(overlap(rot.trailAt(i - 1), rot.trailAt(i))).toEqual([]);
  });

  test('the next visit starts with items the user has not seen, and never with the last trail', () => {
    const storage = memoryStorage();
    const first = createTrailRotation(pool(20), { userKey: 5, storage });
    const shown = first.trailAt(0);
    first.markSeen(shown);
    const next = createTrailRotation(pool(20), { userKey: 5, storage }).trailAt(0);
    expect(overlap(shown, next)).toEqual([]);
  });

  test('seen items are per user', () => {
    const storage = memoryStorage();
    const a = createTrailRotation(pool(16), { userKey: 1, storage });
    a.markSeen(a.trailAt(0));
    expect(storage.getItem('kentexa_trail_seen_1')).not.toBeNull();
    expect(storage.getItem('kentexa_trail_seen_2')).toBeNull();
  });

  test('a trail is stable within a session', () => {
    const rot = createTrailRotation(pool(20), { userKey: 5, storage: memoryStorage() });
    expect(rot.trailAt(2)).toBe(rot.trailAt(2));
  });

  test('boost-ready: every trail is organic and not boosted by default', () => {
    const trail = createTrailRotation(pool(20), { userKey: 5, storage: memoryStorage() }).trailAt(0);
    expect(trail).toEqual(expect.objectContaining({ boosted: false, slot_source: SLOT_SOURCE.ORGANIC, kind: 'product_trail' }));
  });

  test('blocked storage still rotates', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const rot = createTrailRotation(pool(20), { userKey: 5, storage: broken });
    expect(() => rot.markSeen(rot.trailAt(0))).not.toThrow();
    expect(overlap(rot.trailAt(0), rot.trailAt(1))).toEqual([]);
  });
});
