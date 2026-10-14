import { BadRequestException } from '@nestjs/common';
import { BusinessCapabilityApplicationService, OWNER_NOT_VERIFIED_MESSAGE } from './business-capability-application.service';
import { BusinessCapabilityCode } from './entities/business-capability.entity';
import { BusinessCapabilityApplicationStatus } from './entities/business-capability-application.entity';

// Owner 2026-10-13: a store (COMMERCE) or an office (SUPER_AGENT) approved
// through the business-capability route needs the applicant's ID VERIFIED,
// like the direct seller and office approvals. Before this, the route had no
// ID check at all: a waiting ID went straight on to approval.
function setup(capabilityCode: BusinessCapabilityCode, idStatus: string | null) {
  const application = { id: 7, status: BusinessCapabilityApplicationStatus.PENDING, capabilityCode, requestedByUserId: 60 };
  const saves: any[] = [];
  const manager: any = {
    getRepository: () => ({ findOne: jest.fn(async () => application), save: jest.fn(async (x: any) => { saves.push(x); return x; }), update: jest.fn() }),
  };
  const ds: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const verification: any = { getIdentityProfile: jest.fn(async () => (idStatus ? { status: idStatus } : null)) };
  const service: any = new BusinessCapabilityApplicationService({} as any, {} as any, ds, verification, {} as any);
  // The next step after the ID rule: stop there, so only the rule itself is tested.
  service.revalidateApplicationChain = jest.fn(async () => { throw new Error('past the ID rule'); });
  return { service, verification, saves };
}
const admin: any = { id: 1 };

describe('business-capability approval: stores and offices need a verified owner ID', () => {
  for (const code of [BusinessCapabilityCode.COMMERCE, BusinessCapabilityCode.SUPER_AGENT, BusinessCapabilityCode.TRANSPORT]) {
    it(`${code}: a waiting, missing or rejected ID is refused before anything is written`, async () => {
      for (const idStatus of ['pending', null, 'rejected', 'not_submitted']) {
        const { service, verification, saves } = setup(code, idStatus);
        const err = await service.approveApplication(7, admin).catch((e: any) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse()).toMatchObject({ code: 'OWNER_IDENTITY_NOT_VERIFIED', message: OWNER_NOT_VERIFIED_MESSAGE });
        expect(verification.getIdentityProfile).toHaveBeenCalledWith(60);
        expect(service.revalidateApplicationChain).not.toHaveBeenCalled();
        expect(saves).toHaveLength(0);
      }
    });

    it(`${code}: a verified ID goes on to the normal approval`, async () => {
      const { service } = setup(code, 'verified');
      await expect(service.approveApplication(7, admin)).rejects.toThrow('past the ID rule');
    });
  }

  it('service applications are not affected (no ID lookup here)', async () => {
    for (const code of [BusinessCapabilityCode.SERVICE]) {
      const { service, verification } = setup(code, 'pending');
      await expect(service.approveApplication(7, admin)).rejects.toThrow('past the ID rule');
      expect(verification.getIdentityProfile).not.toHaveBeenCalled();
    }
  });
});
