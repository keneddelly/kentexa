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
  s.locationIntelligence = {
    resolve: jest.fn(async (ref: any) => ref.providerPlaceId === 'kariakoo'
      ? { providerKey: 'tz-admin', providerPlaceId: 'kariakoo', displayLabel: 'Kariakoo, Ilala, Dar es Salaam', regionId: 2, regionName: 'Dar es Salaam', districtId: 7, districtName: 'Ilala', wardId: 70, wardName: 'Kariakoo' }
      : null),
  };
  return s;
}
const user: any = { id: 50, activeRoles: [], avatarUrl: null, phone: '255712345678' };
const form: any = {
  businessName: 'Kariakoo Hub', address: 'Mtaa wa Congo',
  place: { providerKey: 'tz-admin', providerPlaceId: 'kariakoo' },
  officePoint: { latitude: -6.8162, longitude: 39.2794, accuracyM: 25 },
};
const waitingId = { status: IdentityVerificationStatus.PENDING };

describe('the office form (place list, GPS point, account phone)', () => {
  it('saves the place from the list, the GPS point and the account phone', async () => {
    const s = service(waitingId);
    await s.apply(user, { ...form, city: 'Arusha', phone: '0799999999' }); // old fields are ignored
    expect(s.superAgentRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      businessName: 'Kariakoo Hub', city: 'Dar es Salaam', regionName: 'Dar es Salaam', districtName: 'Ilala', wardName: 'Kariakoo',
      locationLabel: 'Kariakoo, Ilala, Dar es Salaam', latitude: -6.8162, longitude: 39.2794, locationResolutionMethod: 'device_gps',
      phone: '255712345678', address: 'Mtaa wa Congo', cityCode: 'DAR',
    }));
  });

  it('a place outside the 26-town list works (cityCode from its region)', async () => {
    const s = service(waitingId);
    s.locationIntelligence.resolve = jest.fn(async () => ({ providerKey: 'tz-admin', providerPlaceId: 'x', displayLabel: 'Ifakara, Kilombero, Morogoro', regionName: 'Morogoro' }));
    await s.apply(user, { ...form, address: '' });
    expect(s.superAgentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ city: 'Morogoro', address: 'Ifakara, Kilombero, Morogoro' }));
  });

  it('refuses a missing name, place, GPS point or account phone, each with its own message, and saves nothing', async () => {
    const cases: [any, any, string][] = [
      [{ ...form, businessName: '  ' }, user, OFFICE_SIGNUP_MESSAGES.nameRequired],
      [{ ...form, place: undefined }, user, OFFICE_SIGNUP_MESSAGES.placeRequired],
      [{ ...form, place: { providerKey: 'tz-admin', providerPlaceId: 'nowhere' } }, user, OFFICE_SIGNUP_MESSAGES.placeRequired],
      [{ ...form, officePoint: undefined }, user, OFFICE_SIGNUP_MESSAGES.pointRequired],
      [form, { ...user, phone: null }, OFFICE_SIGNUP_MESSAGES.noPhone],
    ];
    for (const [f, u, message] of cases) {
      const s = service(waitingId);
      await expect(s.apply(u, f)).rejects.toThrow(message);
      expect(s.superAgentRepo.save).not.toHaveBeenCalled();
    }
  });

  it('refuses a point outside Tanzania or a weak GPS reading', async () => {
    for (const officePoint of [{ latitude: 51.5, longitude: -0.12, accuracyM: 10 }, { latitude: -6.8, longitude: 39.28, accuracyM: 2000 }]) {
      const s = service(waitingId);
      await expect(s.apply(user, { ...form, officePoint })).rejects.toThrow();
      expect(s.superAgentRepo.save).not.toHaveBeenCalled();
    }
  });
});

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
