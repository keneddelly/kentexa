import fs from 'fs';
import path from 'path';
import { presentationForRole } from '../../context/rolePresentation';

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// I2F: the frontend may request a comment/reply/offer, but never chooses the acting CommerceProfile.
test('comment, reply and offer writes never carry an acting commerceProfileId', () => {
  for (const rel of ['components/CommerceCommentSection.js', 'pages/HomeFeed.js']) {
    const source = read(rel);
    // strip read-only list/filter queries (params: { commerceProfileId }, /products/profile/:id)
    const writes = source.split('\n').filter((l) => /commerceProfileId:\s*activeProfileId/.test(l));
    const filterOnly = writes.filter((l) => !/params/.test(l));
    expect(filterOnly).toEqual([]);
  }
});

test('the active presentation id is the server canonical CommerceProfile, never a sellerProfileId match', () => {
  const legacyBusinessProfile = { id: 6, type: 'business', ownerId: 2, sellerProfileId: 1 };
  const role = { accountRoleId: 38, roleType: 'seller', userId: 2, profileId: 1, identityType: 'BUSINESS', businessId: 2, commerceProfileId: 26, displayName: 'BiS' };
  expect(presentationForRole(role, [legacyBusinessProfile], { id: 2 }).id).toBe(26);
  const unresolvedBusiness = { ...role, commerceProfileId: null };
  expect(presentationForRole(unresolvedBusiness, [legacyBusinessProfile], { id: 2 }).id).toBeNull();
});
