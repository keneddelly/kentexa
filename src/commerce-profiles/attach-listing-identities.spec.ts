import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfileType } from './entities/commerce-profile.entity';

describe('attachListingIdentities (owner 2026-10-26: verified tick in Soko and feed must agree)', () => {
  it('uses the profile the listing was posted as, else the owner business; tick by the one rule', async () => {
    const svc = Object.create(CommerceProfilesService.prototype) as CommerceProfilesService;
    (svc as any).repo = { find: jest.fn(async () => [{ id: 5, type: CommerceProfileType.BUSINESS, displayName: 'BiS', photoUrl: 'b.png', isVerified: true }]) };
    (svc as any).findMapForOwnersByType = jest.fn(async () => new Map([[9, { id: 7, type: CommerceProfileType.BUSINESS, displayName: 'KenteXa', photoUrl: null, isVerified: false }]]));
    const out = await svc.attachListingIdentities([
      { id: 1, commerceProfileId: 5, seller: { id: 3, isVerified: true } },
      { id: 2, commerceProfileId: null, seller: { id: 9, isOfficialStore: true } },
      { id: 3, commerceProfileId: null, seller: { id: 4, isVerified: true } },
    ] as any);
    expect(out[0].commerceProfile).toEqual({ id: 5, displayName: 'BiS', photoUrl: 'b.png', isVerified: true });
    expect(out[1].commerceProfile).toEqual({ id: 7, displayName: 'KenteXa', photoUrl: null, isVerified: true });
    expect(out[2].commerceProfile).toBeNull(); // OTP-verified account alone: no profile, no tick
  });
});
