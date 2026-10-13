import { BadRequestException } from '@nestjs/common';
import { BusinessCapabilityLifecycleService } from './business-capability-lifecycle.service';
import { BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { OWNER_NOT_VERIFIED_CODE, OWNER_NOT_VERIFIED_MESSAGE } from './capability-owner-identity';

// Owner 2026-10-13: reactivating a business's selling (COMMERCE) or office
// (SUPER_AGENT) rights after a suspension needs the business owner's ID
// VERIFIED -- the same shared rule as approval. Before this, reactivation
// had no ID check at all.
function setup(capabilityCode: BusinessCapabilityCode, idStatus: string | null, status = BusinessCapabilityStatus.SUSPENDED) {
  const cap: any = { id: 3, workspaceId: 11, capabilityCode, status, statusReason: 'held' };
  const save = jest.fn(async (x: any) => x);
  const query = jest.fn(async () => [{ userId: 60 }]);
  const manager: any = { getRepository: () => ({ findOne: jest.fn(async () => cap), save }), query };
  const ds: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const verification: any = { getIdentityProfile: jest.fn(async () => (idStatus ? { status: idStatus } : null)) };
  const service = new BusinessCapabilityLifecycleService({} as any, ds, {} as any, verification);
  return { service, cap, save, query, verification };
}
const admin: any = { id: 1 };

describe('reactivating selling or office rights needs a verified owner ID', () => {
  for (const code of [BusinessCapabilityCode.COMMERCE, BusinessCapabilityCode.SUPER_AGENT]) {
    it(`${code}: a waiting, missing or rejected owner ID is refused and nothing is written`, async () => {
      for (const idStatus of ['pending', null, 'rejected']) {
        const { service, cap, save, query, verification } = setup(code, idStatus);
        const err = await service.reactivate(3, admin).catch((e: any) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse()).toMatchObject({ code: OWNER_NOT_VERIFIED_CODE, message: OWNER_NOT_VERIFIED_MESSAGE });
        expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN public.business b'), [11]);  // the business owner
        expect(verification.getIdentityProfile).toHaveBeenCalledWith(60);
        expect(save).not.toHaveBeenCalled();
        expect(cap.status).toBe(BusinessCapabilityStatus.SUSPENDED);
      }
    });

    it(`${code}: a verified owner ID reactivates as before`, async () => {
      const { service, save } = setup(code, 'verified');
      const res: any = await service.reactivate(3, admin);
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: BusinessCapabilityStatus.ACTIVE, reactivatedByUserId: 1 }));
      expect(res.capability.status).toBe(BusinessCapabilityStatus.ACTIVE);
    });
  }

  it('transport and service rights are not affected', async () => {
    for (const code of [BusinessCapabilityCode.TRANSPORT, BusinessCapabilityCode.SERVICE]) {
      const { service, save, verification } = setup(code, 'pending');
      await service.reactivate(3, admin);
      expect(verification.getIdentityProfile).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalled();
    }
  });

  it('already active: unchanged idempotent answer, no ID lookup', async () => {
    const { service, save, verification } = setup(BusinessCapabilityCode.COMMERCE, 'pending', BusinessCapabilityStatus.ACTIVE);
    await service.reactivate(3, admin);
    expect(verification.getIdentityProfile).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
