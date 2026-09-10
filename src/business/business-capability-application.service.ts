import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessCapabilityApplication,
  BusinessCapabilityApplicationStatus,
} from './entities/business-capability-application.entity';
import { BusinessCapabilityCode } from './entities/business-capability.entity';

// Business Capability Activation Stage B1. INTERNAL FOUNDATION ONLY -- no
// HTTP surface, no submission orchestration, no SellerProfile/AccountRole
// creation. Those belong to Stage B2 (application creation) and Stage B3
// (approval transaction), which will build on the helpers here rather than
// duplicating this table's own query/status logic.
//
// Deliberately simple explicit guards rather than a state-machine
// framework (Stage B1 mission §15) -- PENDING/APPROVED/REJECTED/CANCELLED
// only ever transition through the future approval/rejection/cancellation
// flows' own code, never through generic setters here.
@Injectable()
export class BusinessCapabilityApplicationService {
  constructor(
    @InjectRepository(BusinessCapabilityApplication)
    private readonly applicationRepo: Repository<BusinessCapabilityApplication>,
  ) {}

  /** The one currently-live application for this workspace+capability, if any. */
  async findPending(
    workspaceId: number,
    capabilityCode: BusinessCapabilityCode,
  ): Promise<BusinessCapabilityApplication | null> {
    return this.applicationRepo.findOne({
      where: { workspaceId, capabilityCode, status: BusinessCapabilityApplicationStatus.PENDING },
    });
  }

  /** Most recent application of any status for this workspace+capability -- for tile-state precedence (Stage B discovery §22). */
  async findLatest(
    workspaceId: number,
    capabilityCode: BusinessCapabilityCode,
  ): Promise<BusinessCapabilityApplication | null> {
    return this.applicationRepo.findOne({
      where: { workspaceId, capabilityCode },
      order: { id: 'DESC' },
    });
  }

  /**
   * Throws if a PENDING application already exists for this workspace+
   * capability. Also enforced at the database level by
   * UQ_bca_workspace_code_pending (Migration 9) -- this is the
   * fast-fail, friendly-error path; the partial unique index is what
   * actually guarantees the invariant under concurrent submissions.
   */
  async validateNoPending(
    workspaceId: number,
    capabilityCode: BusinessCapabilityCode,
  ): Promise<void> {
    const existing = await this.findPending(workspaceId, capabilityCode);
    if (existing) {
      throw new ConflictException({
        code: 'CAPABILITY_APPLICATION_ALREADY_PENDING',
        message: 'CAPABILITY_APPLICATION_ALREADY_PENDING',
      });
    }
  }

  /** True only for a row whose status is still PENDING -- guards against Stage B1 mission §15's "casually treat APPROVED/REJECTED/CANCELLED as PENDING." */
  isPending(application: BusinessCapabilityApplication): boolean {
    return application.status === BusinessCapabilityApplicationStatus.PENDING;
  }
}
