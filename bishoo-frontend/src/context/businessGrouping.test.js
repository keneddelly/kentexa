import { groupProfilesForSwitcher, activeBusinessNameFor, isPersonalProfile } from './businessGrouping';

const buyer = { accountRoleId: 26, roleType: 'buyer', type: 'personal', displayName: 'Kened', businessId: null, businessName: null };
const sellerBiz1 = { accountRoleId: 38, roleType: 'seller', type: 'business', displayName: 'BiS', businessId: 2, businessName: 'Bishoo Intelligence Systems' };
const transportBiz1 = { accountRoleId: 45, roleType: 'transport_provider', type: 'transport_provider', displayName: 'BiS Transport', businessId: 2, businessName: 'Bishoo Intelligence Systems' };
const sellerBiz2 = { accountRoleId: 101, roleType: 'seller', type: 'business', displayName: 'Second Co', businessId: 5, businessName: 'Second Co' };
const superAgentUnbound = { accountRoleId: 41, roleType: 'super_agent', type: 'hub', displayName: 'Hub', businessId: null, businessName: null };

test('#1 zero Businesses: only Personal, no business groups', () => {
  const { personal, businesses, other } = groupProfilesForSwitcher([buyer]);
  expect(personal.accountRoleId).toBe(26);
  expect(businesses).toEqual([]);
  expect(other).toEqual([]);
});

test('#2 one Business: a single group with its one capability', () => {
  const { businesses } = groupProfilesForSwitcher([buyer, sellerBiz1]);
  expect(businesses).toHaveLength(1);
  expect(businesses[0]).toMatchObject({ businessId: 2, businessName: 'Bishoo Intelligence Systems' });
  expect(businesses[0].capabilities.map((c) => c.accountRoleId)).toEqual([38]);
});

test('#3 multiple Businesses fixture: two distinct groups, each with only its own capability', () => {
  const { businesses } = groupProfilesForSwitcher([buyer, sellerBiz1, sellerBiz2, transportBiz1]);
  expect(businesses).toHaveLength(2);
  const biz1 = businesses.find((b) => b.businessId === 2);
  const biz2 = businesses.find((b) => b.businessId === 5);
  expect(biz1.capabilities.map((c) => c.accountRoleId).sort()).toEqual([38, 45]);
  expect(biz2.capabilities.map((c) => c.accountRoleId)).toEqual([101]);
});

test('#4 Personal is a distinct field, never folded into businesses/other', () => {
  const grouped = groupProfilesForSwitcher([buyer, sellerBiz1]);
  expect(isPersonalProfile(grouped.personal)).toBe(true);
  expect(grouped.businesses.some((b) => b.capabilities.some((c) => c.roleType === 'buyer'))).toBe(false);
  expect(grouped.other.some((p) => p.roleType === 'buyer')).toBe(false);
});

test('unbound operational roles (no businessId) go to "other", never fabricated into a business group', () => {
  const { businesses, other } = groupProfilesForSwitcher([buyer, sellerBiz1, superAgentUnbound]);
  expect(other.map((p) => p.accountRoleId)).toEqual([41]);
  expect(businesses.every((b) => b.capabilities.every((c) => c.accountRoleId !== 41))).toBe(true);
});

test('#15 duplicate same-roleType AccountRoles (Seller A + Seller B) display under their own distinct Businesses, never merged', () => {
  const { businesses } = groupProfilesForSwitcher([buyer, sellerBiz1, sellerBiz2]);
  const sellerRows = businesses.flatMap((b) => b.capabilities).filter((c) => c.roleType === 'seller');
  expect(sellerRows).toHaveLength(2);
  expect(sellerRows.map((r) => r.accountRoleId).sort((a, b) => a - b)).toEqual([38, 101]);
  // each seller row still resolves to its OWN business, not a shared one
  expect(businesses.find((b) => b.capabilities.includes(sellerRows.find((r) => r.accountRoleId === 38))).businessId).toBe(2);
  expect(businesses.find((b) => b.capabilities.includes(sellerRows.find((r) => r.accountRoleId === 101))).businessId).toBe(5);
});

test('activeBusinessNameFor resolves the active role\'s business name from roleOptions, not from activeContext directly', () => {
  const roleOptions = [buyer, sellerBiz1];
  expect(activeBusinessNameFor({ accountRoleId: 38 }, roleOptions)).toBe('Bishoo Intelligence Systems');
  expect(activeBusinessNameFor({ accountRoleId: 26 }, roleOptions)).toBeNull(); // Personal -- no business
  expect(activeBusinessNameFor(null, roleOptions)).toBeNull();
  expect(activeBusinessNameFor({ accountRoleId: 999 }, roleOptions)).toBeNull(); // unknown role -- never guesses
});
