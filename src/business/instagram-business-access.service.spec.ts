import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InstagramBusinessAccessService } from './instagram-business-access.service';
import { BusinessStatus } from './entities/business.entity';
import { BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { OperationalWorkspaceStatus } from './entities/operational-workspace.entity';

describe('InstagramBusinessAccessService', () => {
  const businessRepo = { findOne: jest.fn() };
  const membershipRepo = { findOne: jest.fn() };
  const assignmentRepo = { find: jest.fn() };
  const workspaceRepo = { find: jest.fn() };
  const service = new InstagramBusinessAccessService(
    businessRepo as any,
    membershipRepo as any,
    assignmentRepo as any,
    workspaceRepo as any,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    businessRepo.findOne.mockResolvedValue({ id: 10, status: BusinessStatus.ACTIVE });
    membershipRepo.findOne.mockResolvedValue({ id: 20, businessId: 10, userId: 30, status: BusinessMembershipStatus.ACTIVE });
    assignmentRepo.find.mockResolvedValue([{ id: 40, workspaceId: 50, status: WorkspaceAssignmentStatus.ACTIVE, permissions: { canManageIntegrations: true } }]);
    workspaceRepo.find.mockResolvedValue([{ id: 50, businessId: 10, status: OperationalWorkspaceStatus.ACTIVE }]);
  });

  it('allows the owner when the active owner assignment grants integration management', async () => {
    await expect(service.assertCanManage(10, 30)).resolves.toBeUndefined();
    expect(membershipRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: 10, userId: 30, status: BusinessMembershipStatus.ACTIVE },
    }));
  });

  it('does not grant integration access to an assignment without the explicit permission', async () => {
    assignmentRepo.find.mockResolvedValue([{ id: 40, workspaceId: 50, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }]);
    await expect(service.assertCanManage(10, 30)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant access through an inactive workspace', async () => {
    workspaceRepo.find.mockResolvedValue([]);
    await expect(service.assertCanManage(10, 30)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps missing businesses concealed', async () => {
    businessRepo.findOne.mockResolvedValue(null);
    await expect(service.assertCanManage(10, 30)).rejects.toBeInstanceOf(NotFoundException);
    expect(membershipRepo.findOne).not.toHaveBeenCalled();
  });
});
