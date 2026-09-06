import { ForbiddenException } from '@nestjs/common';
import { TransportService } from './transport.service';
import { AssignmentStatus } from './entities/transport-assignment.entity';

/**
 * Legacy authority security closure: the admin/manager override that lets
 * a caller skip the assignment ownership check AND the state-machine
 * transition guard must come from the caller's CURRENTLY ACTIVE
 * RoleContext, never the legacy caller.role field.
 */
describe('TransportService legacy authority closure', () => {
  const buildService = () => {
    const assignmentRepo: any = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
    };
    const providerRepo: any = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
    const superAgentRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const noop: any = {};
    const service = new TransportService(
      providerRepo,
      noop, // route repo
      noop, // availability repo
      assignmentRepo,
      noop, // serviceAd repo
      noop, // user repo
      noop, // parcel repo
      noop, // parcelTracking repo
      superAgentRepo,
      noop, // shipment repo
      noop, // reputationService
      noop, // commerceProfiles
      noop, // tzLocation
      noop, // roleContextService
    );
    return { service, assignmentRepo, providerRepo, superAgentRepo };
  };

  const buildAssignment = () => ({
    id: 1,
    providerId: 200,
    assignedById: 300,
    status: AssignmentStatus.COLLECTED,
    // no parcelRefId/parcelId/availabilityId — keeps the cross-service sync
    // paths inert for this authorization-only test.
  });

  it('an unrelated caller active as BUYER cannot update someone else\'s assignment via admin override', async () => {
    const { service, assignmentRepo } = buildService();
    assignmentRepo.findOne.mockResolvedValue(buildAssignment());
    await expect(
      service.updateAssignmentStatus(
        { id: 999 } as any,
        1,
        { status: AssignmentStatus.CANCELLED },
        { roleType: 'buyer' } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('an unrelated caller active as ADMIN can update any assignment, including skipping the transition guard', async () => {
    const { service, assignmentRepo } = buildService();
    assignmentRepo.findOne.mockResolvedValue(buildAssignment());
    await expect(
      service.updateAssignmentStatus(
        { id: 999 } as any,
        1,
        { status: AssignmentStatus.COMPLETED }, // not a normally-allowed transition from COLLECTED
        { roleType: 'admin' } as any,
      ),
    ).resolves.toBeDefined();
  });

  it('the owning provider can always update their own assignment through an allowed transition', async () => {
    const { service, assignmentRepo, providerRepo } = buildService();
    assignmentRepo.findOne.mockResolvedValue(buildAssignment());
    providerRepo.findOne.mockResolvedValue({ id: 200, userId: 999 });
    await expect(
      service.updateAssignmentStatus(
        { id: 999 } as any,
        1,
        { status: AssignmentStatus.DEPARTED },
        { roleType: 'transport_provider' } as any,
      ),
    ).resolves.toBeDefined();
  });

  it('the owning provider cannot skip the state-machine transition guard without admin authority', async () => {
    const { service, assignmentRepo, providerRepo } = buildService();
    assignmentRepo.findOne.mockResolvedValue(buildAssignment());
    providerRepo.findOne.mockResolvedValue({ id: 200, userId: 999 });
    await expect(
      service.updateAssignmentStatus(
        { id: 999 } as any,
        1,
        { status: AssignmentStatus.COMPLETED }, // not reachable from COLLECTED
        { roleType: 'transport_provider' } as any,
      ),
    ).rejects.toThrow();
  });
});
