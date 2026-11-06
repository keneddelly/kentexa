import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Business, BusinessStatus } from './entities/business.entity';
import { BusinessMembership, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';

/**
 * Resolves Instagram integration authority from Kentexa's live organizational
 * chain. Business ownership or membership alone is deliberately insufficient:
 * a caller needs an active membership, active workspace assignment, active
 * workspace, and an explicit canManageIntegrations grant.
 */
@Injectable()
export class InstagramBusinessAccessService {
  constructor(
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(BusinessMembership) private readonly membershipRepo: Repository<BusinessMembership>,
    @InjectRepository(WorkspaceAssignment) private readonly assignmentRepo: Repository<WorkspaceAssignment>,
    @InjectRepository(OperationalWorkspace) private readonly workspaceRepo: Repository<OperationalWorkspace>,
  ) {}

  async assertCanManage(businessId: number, userId: number): Promise<void> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business || business.status !== BusinessStatus.ACTIVE) {
      throw new NotFoundException('Business not found');
    }

    const membership = await this.membershipRepo.findOne({
      where: {
        businessId,
        userId,
        status: BusinessMembershipStatus.ACTIVE,
      },
    });
    if (!membership) throw new NotFoundException('Business not found');

    const assignments = await this.assignmentRepo.find({
      where: {
        businessMembershipId: membership.id,
        status: WorkspaceAssignmentStatus.ACTIVE,
      },
    });
    if (!assignments.length) {
      throw new ForbiddenException('An active workspace assignment is required to manage Instagram integrations.');
    }

    const workspaceIds = assignments.map((assignment) => assignment.workspaceId);
    const workspaces = await this.workspaceRepo.find({
      where: {
        id: In(workspaceIds),
        businessId,
        status: OperationalWorkspaceStatus.ACTIVE,
      },
    });
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const hasPermission = assignments.some((assignment) =>
      activeWorkspaceIds.has(assignment.workspaceId) &&
      assignment.permissions?.canManageIntegrations === true,
    );

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to manage integrations for this Business.');
    }
  }
}
