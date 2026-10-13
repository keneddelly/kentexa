import { SuperAgentsService, OFFICE_SIGNUP_MESSAGES } from './super-agents.service';
import { IdentityVerificationStatus } from '../identity/entities/identity-profile.entity';

// Opening an office (owner 2026-10-13): ID sent in to apply (waiting is fine);
// the new office stays PENDING (hidden, no counter work) until an admin
// approves it, and the admin can approve only a VERIFIED ID.
function service(identity: any) {
  const s: any = Object.create(SuperAgentsService.prototype);
  s.verification = {
    getIdentityProfile: jest.fn(async () => identity),
    generateReferralCodeIfMissing: jest.fn(async () => undefined),
    processReferralQualification: jest.fn(async () => undefined),
  };
  s.resolveActingSuperAgent = jest.fn(async () => null);
  s.superAgentRepo = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: 11, ...x })), findOne: jest.fn() };
  s.userRepo = { update: jest.fn(async () => undefined) };
  s.roleContextService = { syncOperationalRole: jest.fn(async () => undefined) };
  s.commerceProfiles = { syncStatusByLink: jest.fn(async () => undefined), createProfile: jest.fn(async () => undefined) };
  return s;
}
const user: any = { id: 50, activeRoles: [], avatarUrl: null };
const form = { businessName: 'Kariakoo Hub', city: 'Dar es Salaam', address: 'Mtaa wa Congo', phone: '255712345678' };

describe('opening an office', () => {
  it('no ID sent in: refused; rejected ID: its own message', async () => {
    await expect(service(null).apply(user, form)).rejects.toThrow(OFFICE_SIGNUP_MESSAGES.identityFirst);
    await expect(service({ status: IdentityVerificationStatus.REJECTED }).apply(user, form)).rejects.toThrow(OFFICE_SIGNUP_MESSAGES.identityRejected);
  });

  it('ID waiting: the office is created PENDING, with its role and profile pending; the account is not switched to an office', async () => {
    const s = service({ status: IdentityVerificationStatus.PENDING });
    const r = await s.apply(user, form);
    expect(r).toMatchObject({ status: 'pending', message: OFFICE_SIGNUP_MESSAGES.submitted });
    expect(s.roleContextService.syncOperationalRole).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(s.commerceProfiles.createProfile).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(s.userRepo.update).not.toHaveBeenCalled();
  });

  it('approval needs the owner ID VERIFIED; then the office becomes active', async () => {
    const waiting = service({ status: IdentityVerificationStatus.PENDING });
    waiting.superAgentRepo.findOne = jest.fn(async () => ({ id: 11, status: 'pending', user: { id: 50, activeRoles: [] } }));
    await expect(waiting.approve(11)).rejects.toThrow(OFFICE_SIGNUP_MESSAGES.approveNeedsVerified);
    expect(waiting.superAgentRepo.save).not.toHaveBeenCalled();

    const ok = service({ status: IdentityVerificationStatus.VERIFIED });
    ok.superAgentRepo.findOne = jest.fn(async () => ({ id: 11, status: 'pending', user: { id: 50, activeRoles: [] } }));
    await ok.approve(11);
    expect(ok.superAgentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    expect(ok.roleContextService.syncOperationalRole).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });
});
