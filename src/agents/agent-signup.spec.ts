import { BadRequestException } from '@nestjs/common';
import { AgentsService, AGENT_SIGNUP_MESSAGES } from './agents.service';
import { IdentityVerificationStatus } from '../identity/entities/identity-profile.entity';
import { AGENT_BASE_MESSAGES } from '../shipments/pickup-pin';

// Agent sign-up (owner 2026-10-13): identity from the account (sent in = may
// apply; approval needs verified), name/phone from the account, city from the
// place list, base point required, vehicle + max weight. No ID typed again.
const KARIAKOO = { providerKey: 'tz_seed', providerPlaceId: 'kariakoo' };
const good = { place: KARIAKOO, base: { latitude: -6.8185, longitude: 39.277, accuracyM: 20 }, agentType: 'boda', maxWeightKg: 25 };

function service(identity: any, account: any = { id: 50, name: 'Juma Ally', phone: '255712345678' }) {
  const s: any = Object.create(AgentsService.prototype);
  s.verification = { getIdentityProfile: jest.fn(async () => identity) };
  s.locations = { resolve: jest.fn(async () => ({ regionName: 'Dar es Salaam', districtName: 'Ilala', displayLabel: 'Kariakoo, Ilala, Dar es Salaam' })) };
  s.userRepo = { findOne: jest.fn(async () => account), update: jest.fn(async () => undefined) };
  const saved: any[] = [];
  s.agentRepo = {
    findOne: jest.fn(async () => null),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => { saved.push(x); return { id: 9, ...x }; }),
    update: jest.fn(async () => undefined),
  };
  s.commerceProfiles = { createProfile: jest.fn(async () => undefined), syncStatusByLink: jest.fn(async () => undefined) };
  return { s, saved };
}
const user: any = { id: 50, avatarUrl: null };

describe('agent sign-up: identity from the account', () => {
  it('no identity sent in: refused, ask for it first', async () => {
    await expect(service(null).s.register(user, good)).rejects.toThrow(AGENT_SIGNUP_MESSAGES.identityFirst);
  });
  it('identity rejected: refused with its own message', async () => {
    await expect(service({ status: IdentityVerificationStatus.REJECTED }).s.register(user, good)).rejects.toThrow(AGENT_SIGNUP_MESSAGES.identityRejected);
  });
  it('identity WAITING: may apply; name from the identity, phone from the account; no ID typed or stored', async () => {
    const t = service({ status: IdentityVerificationStatus.PENDING, legalName: 'Juma Ally Hamisi' });
    await expect(t.s.register(user, { ...good, idNumber: '1999-TYPED', phone: '0700000000' })).resolves.toEqual({ message: AGENT_SIGNUP_MESSAGES.submitted });
    expect(t.saved[0]).toMatchObject({ fullName: 'Juma Ally Hamisi', phone: '255712345678', city: 'Dar es Salaam', region: 'Dar es Salaam',
      district: 'Ilala', agentType: 'boda', maxWeightKg: 25, baseLatitude: -6.8185, baseLongitude: 39.277, status: 'pending' });
    expect(t.saved[0].idNumber).toBeUndefined();
    expect(t.saved[0].baseSetAt).toBeInstanceOf(Date);
  });
});

describe('agent sign-up: where and what', () => {
  const ok = { status: IdentityVerificationStatus.VERIFIED, legalName: 'Juma' };
  it('the city must be picked from the place list', async () => {
    await expect(service(ok).s.register(user, { ...good, place: undefined })).rejects.toThrow(AGENT_SIGNUP_MESSAGES.placeRequired);
  });
  it('the base point is required and follows the base-point rules', async () => {
    await expect(service(ok).s.register(user, { ...good, base: undefined })).rejects.toThrow(AGENT_SIGNUP_MESSAGES.baseRequired);
    await expect(service(ok).s.register(user, { ...good, base: { latitude: -6.8, longitude: 39.2, accuracyM: 900 } })).rejects.toThrow(AGENT_BASE_MESSAGES.weak);
  });
  it('vehicle type and max weight are checked', async () => {
    await expect(service(ok).s.register(user, { ...good, agentType: 'helicopter' })).rejects.toThrow(AGENT_SIGNUP_MESSAGES.vehicle);
    await expect(service(ok).s.register(user, { ...good, maxWeightKg: 0 })).rejects.toThrow(AGENT_SIGNUP_MESSAGES.weight);
  });
  it('an account with no phone cannot apply (no other phone accepted)', async () => {
    await expect(service(ok, { id: 50, name: 'Juma', phone: null }).s.register(user, good)).rejects.toThrow(AGENT_SIGNUP_MESSAGES.noPhone);
  });
});

describe('approval needs a VERIFIED identity', () => {
  const approve = (status: any) => {
    const t = service({ status });
    t.s.agentRepo.findOne = jest.fn(async () => ({ id: 9, city: 'Dar es Salaam', user: { id: 50, activeRoles: [] } }));
    t.s.roleContextService = { syncOperationalRole: jest.fn(async () => undefined) };
    t.s.activityEvents = { record: jest.fn() };
    t.s.smsService = { sendSms: jest.fn(async () => true) };
    return t;
  };
  it('waiting identity: approval refused, nothing changed', async () => {
    const t = approve(IdentityVerificationStatus.PENDING);
    await expect(t.s.approve(9)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.s.approve(9)).rejects.toThrow(AGENT_SIGNUP_MESSAGES.approveNeedsVerified);
    expect(t.s.agentRepo.update).not.toHaveBeenCalled();
  });
  it('verified identity: approval goes ahead', async () => {
    const t = approve(IdentityVerificationStatus.VERIFIED);
    await t.s.approve(9).catch(() => undefined);
    expect(t.s.agentRepo.update).toHaveBeenCalledWith(9, expect.objectContaining({ status: 'approved' }));
  });
});
