import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerProfile } from './entities/seller-profile.entity';
import { SellerService } from './seller.service';
import { User } from '../users/entities/user.entity';
import { BusinessCapabilityApplicationService } from '../business/business-capability-application.service';
import { BusinessCapabilityApplication, BusinessCapabilityApplicationStatus } from '../business/entities/business-capability-application.entity';
import { BusinessCapabilityCode } from '../business/entities/business-capability.entity';
import { RoleProfileType } from '../role-context/entities/account-role.entity';
import { SellerStatus } from './entities/seller-profile.entity';
import { AuditLog } from '../audit-log/entities/audit-log.entity';

/**
 * Compatibility routing for the existing admin Seller Approve/Reject buttons
 * (PATCH /seller/:id/approve|reject).
 *
 * BusinessCapabilityApplication is the ONLY approval authority for Business
 * Selling. A Business-linked SellerProfile is never approved or rejected by the
 * legacy Seller lifecycle: its exact canonical application is found and the
 * canonical engine (which owns the transaction) is called. Only a genuinely
 * legacy/unbound (Personal) SellerProfile keeps the legacy SellerService path.
 *
 * Lives in the Seller module's routing layer (SellerModule already imports
 * BusinessModule; BusinessModule does not import SellerModule), so neither
 * SellerService nor the engine gains a new dependency and no forwardRef is needed.
 */
@Injectable()
export class SellerApprovalBridgeService {
  constructor(
    @InjectRepository(SellerProfile) private readonly profileRepo: Repository<SellerProfile>,
    @InjectRepository(BusinessCapabilityApplication) private readonly applicationRepo: Repository<BusinessCapabilityApplication>,
    private readonly sellerService: SellerService,
    private readonly capabilityApplications: BusinessCapabilityApplicationService,
  ) {}

  async approve(profileId: number, admin: User, verificationTier?: string) {
    const profile = await this.loadProfile(profileId);
    if (profile.businessId == null) return this.sellerService.approve(profileId, verificationTier as any);

    const application = await this.findCanonicalApplication(profile);
    // The engine owns every state: PENDING approves, APPROVED is verified idempotently,
    // REJECTED/CANCELLED throw their explicit conflict. Never the legacy lifecycle.
    return this.capabilityApplications.approveApplication(application.id, admin, { verificationTier });
  }

  async reject(profileId: number, admin: User, reason: string) {
    const profile = await this.loadProfile(profileId);
    if (profile.businessId == null) return this.sellerService.reject(profileId, reason);

    const application = await this.findCanonicalApplication(profile);
    return this.capabilityApplications.rejectApplication(application.id, admin, reason);
  }

  /** Restore an already suspended Seller, without replaying an old application approval. */
  async restore(profileId: number, admin: User, reason: string) {
    const note = reason?.trim() ?? '';
    if (note.length < 3 || note.length > 1000) throw new BadRequestException('A restore reason of 3 to 1000 characters is required');
    const profile = await this.loadProfile(profileId);
    if (profile.status !== SellerStatus.SUSPENDED) {
      throw new ConflictException({ code: 'SELLER_NOT_SUSPENDED', message: 'SELLER_NOT_SUSPENDED' });
    }
    if (profile.businessId != null) {
      // A legacy migrated Seller can have an active commerce entitlement yet
      // no application row. Require its exact suspended role and the full
      // active organizational chain; never approve a fresh or pending role.
      const rows = await this.profileRepo.manager.query(`
        SELECT ar.id FROM account_role ar
        JOIN workspace_assignment wa ON wa.id = ar."workspaceAssignmentId" AND wa.status = 'active'
        JOIN business_membership bm ON bm.id = wa."businessMembershipId" AND bm.status = 'active'
        JOIN operational_workspace w ON w.id = wa."workspaceId" AND w.status = 'active'
        JOIN business b ON b.id = w."businessId" AND b.status = 'active'
        JOIN business_capability bc ON bc."workspaceId" = w.id AND bc."capabilityCode" = 'commerce' AND bc.status = 'active'
        WHERE ar."userId" = $1 AND ar."profileType" = 'seller_profile' AND ar."profileId" = $2
          AND ar."roleType" = 'seller' AND ar.status = 'suspended'
          AND bm."userId" = $1 AND b.id = $3
        LIMIT 1`, [profile.user.id, profile.id, profile.businessId]);
      if (rows.length !== 1) {
        throw new ConflictException({ code: 'SELLER_RESTORE_AUTHORITY_INACTIVE', message: 'SELLER_RESTORE_AUTHORITY_INACTIVE' });
      }
      const applications = await this.applicationRepo.find({ where: {
        operationalProfileType: RoleProfileType.SELLER_PROFILE,
        operationalProfileId: profile.id,
        capabilityCode: BusinessCapabilityCode.COMMERCE,
        businessId: profile.businessId,
      } });
      if (applications.length && !applications.some(a => a.status === BusinessCapabilityApplicationStatus.APPROVED)) {
        throw new ConflictException({ code: 'SELLER_RESTORE_APPLICATION_NOT_APPROVED', message: 'SELLER_RESTORE_APPLICATION_NOT_APPROVED' });
      }
    }
    const restored = await this.sellerService.approve(profileId);
    await this.profileRepo.manager.getRepository(AuditLog).save({
      actorId: admin.id, actorRole: 'admin', action: 'seller.restore', entityType: 'SellerProfile', entityId: profileId,
      previousValue: { status: SellerStatus.SUSPENDED }, newValue: { status: SellerStatus.APPROVED, reason: note },
    });
    return restored;
  }

  private async loadProfile(profileId: number): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Seller profile not found');
    return profile;
  }

  /** Exact linkage only: this SellerProfile id + commerce + this profile's own Business. Never guessed. */
  private async findCanonicalApplication(profile: SellerProfile): Promise<BusinessCapabilityApplication> {
    const applications = await this.applicationRepo.find({
      where: {
        operationalProfileType: RoleProfileType.SELLER_PROFILE,
        operationalProfileId: profile.id,
        capabilityCode: BusinessCapabilityCode.COMMERCE,
        businessId: profile.businessId as number,
      },
    });
    if (applications.length === 0) {
      throw new ConflictException({ code: 'BUSINESS_SELLING_APPLICATION_REQUIRED', message: 'BUSINESS_SELLING_APPLICATION_REQUIRED' });
    }
    if (applications.length > 1) {
      throw new ConflictException({ code: 'BUSINESS_SELLING_APPLICATION_AMBIGUOUS', message: 'BUSINESS_SELLING_APPLICATION_AMBIGUOUS' });
    }
    return applications[0];
  }
}
