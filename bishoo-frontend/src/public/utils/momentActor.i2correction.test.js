import fs from 'fs';
import path from 'path';
import { buildProductMomentPayload, momentActorProfileId } from './publicActor';
import { presentationForRole } from '../../context/rolePresentation';

const product = { id: 42, name: 'Washing Machine 7kg', images: ['w.png'] };

// activeProfile as RoleContext builds it: presentationForRole(activeContext, /profiles/mine, user).
// `id` is the LEGACY presentation profile; `commerceProfileId` is the canonical server value.
const legacyProfiles = [{ id: 77, type: 'business', sellerProfileId: 5, displayName: 'Bob Old Store', ownerId: 1 }];
const bob = { id: 1, name: 'Bob', avatarUrl: null };

test('1. canonical Business context sends its exact canonical profile (never the legacy id)', () => {
  const activeProfile = presentationForRole({
    accountRoleId: 9, roleType: 'seller', userId: 1, profileId: 5, identityType: 'BUSINESS',
    displayName: 'Washing Machine TZ', businessId: 10, commerceProfileId: 2,
  }, legacyProfiles, bob);
  expect(activeProfile.id).toBe(77); // the stale legacy match exists
  const payload = buildProductMomentPayload(product, activeProfile);
  expect(payload.commerceProfileId).toBe(2);
  expect(payload).toMatchObject({ type: 'moment', title: product.name, linkedEntityType: 'product', linkedEntityId: 42, imageUrl: 'w.png' });
});

test('2. a legacy unbound Seller stays PERSONAL: the stale Business profile is never submitted as acting authority', () => {
  const activeProfile = presentationForRole({
    accountRoleId: 3, roleType: 'seller', userId: 1, profileId: 5, identityType: 'PERSONAL',
    displayName: 'Bob', businessId: null, commerceProfileId: 1,
  }, legacyProfiles, bob);
  expect(activeProfile.id).toBe(77); // legacy business-type profile matched by sellerProfileId
  const payload = buildProductMomentPayload(product, activeProfile);
  expect(payload.commerceProfileId).toBe(1); // canonical Personal profile
  expect(payload.commerceProfileId).not.toBe(77);
});

test('legacy unbound Seller with no resolvable canonical profile sends nothing (server fails explicitly; no client-selected identity)', () => {
  const activeProfile = presentationForRole({
    accountRoleId: 3, roleType: 'seller', userId: 1, profileId: 5, identityType: 'PERSONAL', commerceProfileId: null,
  }, legacyProfiles, bob);
  expect(momentActorProfileId(activeProfile)).toBeUndefined();
  expect(buildProductMomentPayload(product, activeProfile).commerceProfileId).toBeUndefined();
});

test('an unresolved/absent active profile sends no actor either', () => {
  expect(momentActorProfileId(null)).toBeUndefined();
  expect(momentActorProfileId({ id: 77 })).toBeUndefined();
});

test('3. contract: ProductDetail publishes through the canonical builder, not the legacy activeProfileId', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ProductDetail.js'), 'utf8');
  expect(source).toContain('buildProductMomentPayload(product, activeProfile)');
  expect(source).not.toMatch(/commerceProfileId:\s*activeProfileId/);
});
