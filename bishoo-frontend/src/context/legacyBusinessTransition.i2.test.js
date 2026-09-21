import { presentationForRole, adaptAvailableRoles, actorKindFor } from './rolePresentation';
import { groupProfilesForSwitcher } from './businessGrouping';
import { capabilityCtaState, CTA_STATE, ctaDestination } from './capabilityTiles';
import {
  actorLabelParts, personalOperationalText, isLegacyPersonalSeller, momentActorProfileId,
  buildProductMomentPayload, actorProfileParams,
} from '../public/utils/publicActor';

const t = (key) => key; // keys are the assertion surface

// Bob (user 14) exactly as production stores him: Personal profile 20 (linked to the legacy
// SellerProfile 7), an unactivated Business 4 with canonical profile 68, and a legacy
// store name that equals the Business name.
const bob = { id: 14, name: 'Bob', avatarUrl: null, storeName: 'washing machine tz' };
const legacyProfiles = [
  { id: 20, type: 'personal', ownerId: 14, sellerProfileId: 7, displayName: 'Bob' },
  { id: 68, type: 'business', ownerId: 14, businessId: 4, displayName: 'washing machine tz' },
];

// What the SERVER returns (I2A identity) — the fixtures for both cases.
const buyerRole = { accountRoleId: 11, roleType: 'buyer', status: 'active', switchable: true, userId: 14, profileId: 14, identityType: 'PERSONAL', displayName: 'Bob', businessId: null, businessName: null, workspaceId: null, commerceProfileId: 20 };
const legacySeller = { accountRoleId: 74, roleType: 'seller', status: 'active', switchable: true, userId: 14, profileId: 7, identityType: 'PERSONAL', displayName: 'Bob', businessId: null, businessName: null, workspaceId: null, commerceProfileId: 20 };
const businessSeller = { accountRoleId: 90, roleType: 'seller', status: 'active', switchable: true, userId: 14, profileId: 21, identityType: 'BUSINESS', displayName: 'Washing Machine Tz', businessId: 4, businessName: 'Washing Machine Tz', workspaceId: 4, commerceProfileId: 68 };

test('PART 1/8. legacy unbound Seller is presented as PERSONAL selling — never as the Business, despite storeName', () => {
  const p = presentationForRole(legacySeller, legacyProfiles, bob);
  expect(p.actorKind).toBe('PERSONAL_OPERATIONAL');
  expect(p.displayName).toBe('Bob');
  expect(personalOperationalText(p, t)).toBe('Bob · actor_label.selling_personal');
  expect(actorLabelParts(p, t)).toEqual({ title: 'Bob', subtitle: 'actor_label.selling_personal' });
  for (const text of [p.displayName, personalOperationalText(p, t), actorLabelParts(p, t).title]) {
    expect(text.toLowerCase()).not.toContain('washing');
  }
  expect(momentActorProfileId(p)).toBe(20); // Bob Personal — not the Business profile 68
});

test('PART 2/6. a real Business context is presented as the Business and publishes as its canonical profile', () => {
  const p = presentationForRole(businessSeller, legacyProfiles, bob);
  expect(p.actorKind).toBe('BUSINESS');
  expect(actorLabelParts(p, t)).toEqual({ title: 'Washing Machine Tz', subtitle: 'actor_label.business' });
  expect(personalOperationalText(p, t)).toBe('Washing Machine Tz'); // no "· Personal" on a Business
  expect(momentActorProfileId(p)).toBe(68);
});

test('PART 7. one identity across the chain: active Business = presented = publish actor = feed actor = clicked profile', () => {
  const active = presentationForRole(businessSeller, legacyProfiles, bob);
  const payload = buildProductMomentPayload({ id: 1, name: 'Washer', images: [] }, active);
  // What FeedService/momentActorFields returns for that stored row (same shape as the API):
  const feedActor = { id: 14, commerceProfileId: payload.commerceProfileId, actorResolved: true, actorType: 'BUSINESS', name: 'Washing Machine Tz' };
  const click = actorProfileParams(feedActor);
  expect(new Set([businessSeller.commerceProfileId, active.commerceProfileId, payload.commerceProfileId, feedActor.commerceProfileId, click.commerceProfileId])).toEqual(new Set([68]));
  expect(feedActor.name).toBe(active.displayName);
});

test('PART 8. Personal chain stays Personal end to end', () => {
  const active = presentationForRole(legacySeller, legacyProfiles, bob);
  const payload = buildProductMomentPayload({ id: 1, name: 'Washer', images: [] }, active);
  expect(payload.commerceProfileId).toBe(20);
  expect(actorProfileParams({ id: 14, commerceProfileId: 20, actorResolved: true }).commerceProfileId).toBe(20);
});

test('PART 1. switcher: the legacy Seller lists under personal roles with an explicit Personal label; the Business is its own group', () => {
  const options = adaptAvailableRoles([buyerRole, legacySeller, businessSeller], legacyProfiles, bob);
  const groups = groupProfilesForSwitcher(options);
  expect(groups.personal.displayName).toBe('Bob');
  expect(groups.other.map((p) => p.accountRoleId)).toEqual([74]);
  expect(personalOperationalText(groups.other[0], t)).toBe('Bob · actor_label.selling_personal');
  expect(groups.businesses.map((g) => [g.businessId, g.businessName])).toEqual([[4, 'Washing Machine Tz']]);
});

test('PART 9. multi-Business: Selling for B only — A and C stay at Start; the legacy Seller stays Personal', () => {
  const asB = { ...businessSeller, businessId: 2, businessName: 'Business B', displayName: 'Business B', commerceProfileId: 200, accountRoleId: 91 };
  const options = adaptAvailableRoles([buyerRole, legacySeller, asB], legacyProfiles, bob);
  expect(groupProfilesForSwitcher(options).businesses.map((g) => g.businessName)).toEqual(['Business B']);
  const wsA = [{ id: 1, capabilities: [] }];
  const wsB = [{ id: 2, capabilities: ['commerce'] }];
  const wsC = [{ id: 3, capabilities: [] }];
  expect([wsA, wsB, wsC].map((ws) => capabilityCtaState('commerce', ws, []))).toEqual([CTA_STATE.START, CTA_STATE.ACTIVE, CTA_STATE.START]);
  expect(ctaDestination('commerce', 1)).toBe('BecomeBusinessCapability-1-commerce');
  expect(isLegacyPersonalSeller(options.find((o) => o.accountRoleId === 74))).toBe(true);
  expect(isLegacyPersonalSeller(options.find((o) => o.accountRoleId === 91))).toBe(false);
});

test('PART 6/12. a server-declared unresolved identity presents as unresolved and sends no actor', () => {
  const broken = { ...businessSeller, identityType: null, displayName: null, commerceProfileId: null, switchable: false };
  const p = presentationForRole(broken, legacyProfiles, bob);
  expect(actorKindFor(broken)).toBe('UNRESOLVED');
  expect(p.actorKind).toBe('UNRESOLVED');
  expect(p.displayName).not.toBe('Bob');
  expect(momentActorProfileId(p)).toBeUndefined();
});
