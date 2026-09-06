import { ForbiddenException } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputeResolution } from './entities/dispute.entity';

/**
 * Legacy authority security closure: the resolve() route's own RolesGuard
 * already requires the caller's ACTIVE role to be admin/manager/
 * arbitrator; this defense-in-depth check must reuse that SAME resolved
 * RoleContext, never the legacy user.role field, so a staff account
 * currently operating as a non-privileged role can't slip through if the
 * guard is ever bypassed or the service is called directly.
 */
describe('DisputesService legacy authority closure', () => {
  const buildService = () => {
    const disputeRepo: any = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    const orderRepo: any = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const service = new DisputesService(disputeRepo, orderRepo, noop, noop);
    return { service, disputeRepo };
  };

  const buildDispute = () => ({
    id: 1,
    arbitrator: { id: 500 },
    order: { id: 10, buyer: {}, seller: {}, paymentMethod: 'online' },
    reason: 'other',
  });

  it('a staff account active as BUYER cannot resolve a dispute via admin override', async () => {
    const { service, disputeRepo } = buildService();
    disputeRepo.findOne.mockResolvedValue(buildDispute());
    await expect(
      service.resolve(
        { id: 999 } as any,
        1,
        { resolution: DisputeResolution.FAVOUR_BUYER, resolutionNote: 'test' },
        { roleType: 'buyer' } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('a staff account active as ADMIN can resolve any dispute', async () => {
    const { service, disputeRepo } = buildService();
    disputeRepo.findOne.mockResolvedValue(buildDispute());
    await expect(
      service.resolve(
        { id: 999 } as any,
        1,
        { resolution: DisputeResolution.FAVOUR_BUYER, resolutionNote: 'test' },
        { roleType: 'admin' } as any,
      ),
    ).resolves.toBeDefined();
  });

  it('the actual assigned arbitrator can always resolve their own assigned dispute', async () => {
    const { service, disputeRepo } = buildService();
    disputeRepo.findOne.mockResolvedValue(buildDispute());
    await expect(
      service.resolve(
        { id: 500 } as any,
        1,
        { resolution: DisputeResolution.FAVOUR_SELLER, resolutionNote: 'test' },
        { roleType: 'arbitrator' } as any,
      ),
    ).resolves.toBeDefined();
  });

  it('missing roleContext never grants admin authority', async () => {
    const { service, disputeRepo } = buildService();
    disputeRepo.findOne.mockResolvedValue(buildDispute());
    await expect(
      service.resolve(
        { id: 999 } as any,
        1,
        { resolution: DisputeResolution.FAVOUR_BUYER, resolutionNote: 'test' },
        undefined,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
