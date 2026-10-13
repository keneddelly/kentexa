import { SellerService, SELLER_SIGNUP_MESSAGES } from './seller.service';
import { IdentityVerificationStatus } from '../identity/entities/identity-profile.entity';

// Rule A (owner 2026-10-13): opening a store needs the ID sent in (waiting is
// fine); an admin approves it only with the owner's ID VERIFIED. Already
// approved sellers are never re-checked. Classified ads are not covered here.
function service(identity: any, existingProfile: any = null) {
  const s: any = Object.create(SellerService.prototype);
  s.verification = {
    getIdentityProfile: jest.fn(async () => identity),
    submitBusinessDocuments: jest.fn(async () => undefined),
  };
  s.profileRepo = {
    findOne: jest.fn(async () => existingProfile),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: 21, ...x })),
  };
  return s;
}
const user: any = { id: 60, name: 'Neema Juma' };
const dto: any = { sellerType: 'individual', businessCategory: 'fashion' };

describe('opening a store (rule A)', () => {
  it('no ID sent: refused; rejected ID: its own message; nothing saved', async () => {
    for (const [identity, message] of [[null, SELLER_SIGNUP_MESSAGES.identityFirst],
      [{ status: IdentityVerificationStatus.NOT_SUBMITTED }, SELLER_SIGNUP_MESSAGES.identityFirst],
      [{ status: IdentityVerificationStatus.REJECTED }, SELLER_SIGNUP_MESSAGES.identityRejected]] as any[]) {
      const s = service(identity);
      await expect(s.apply(dto, user)).rejects.toThrow(message);
      expect(s.profileRepo.save).not.toHaveBeenCalled();
    }
  });

  it('ID waiting or verified: the request is saved PENDING', async () => {
    for (const status of [IdentityVerificationStatus.PENDING, IdentityVerificationStatus.VERIFIED]) {
      const s = service({ status });
      // stop right after the save: the rest of apply() is not part of this rule
      s.profileRepo.save = jest.fn(async () => { throw new Error('saved'); });
      await expect(s.apply(dto, user)).rejects.toThrow('saved');
      expect(s.profileRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', businessName: 'Neema Juma' }));
    }
  });

  it('approval needs the owner ID VERIFIED; a waiting ID is refused before anything is written', async () => {
    const s = service({ status: IdentityVerificationStatus.PENDING }, { id: 21, status: 'pending', user: { id: 60 } });
    await expect(s.approve(21)).rejects.toThrow(SELLER_SIGNUP_MESSAGES.approveNeedsVerified);
    expect(s.profileRepo.save).not.toHaveBeenCalled();
    expect(s.verification.getIdentityProfile).toHaveBeenCalledWith(60);
  });

  it('an already approved seller is not re-checked (e.g. a tier change)', async () => {
    const s = service(null, { id: 21, status: 'approved', user: { id: 60 } });
    // stop right after the ID rule: the rest of approve() is not part of it
    s.resolveSellerOrganizationalContext = jest.fn(async () => { throw new Error('past the ID rule'); });
    await expect(s.approve(21)).rejects.toThrow('past the ID rule');
    expect(s.verification.getIdentityProfile).not.toHaveBeenCalled();
  });
});
