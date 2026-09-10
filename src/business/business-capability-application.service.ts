import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BusinessCapabilityApplication,
  BusinessCapabilityApplicationStatus,
} from './entities/business-capability-application.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { Business } from './entities/business.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { User } from '../users/entities/user.entity';
import {
  AccountRole,
  AccountRoleStatus,
  AccountRoleType,
  RoleProfileType,
} from '../role-context/entities/account-role.entity';

export interface ApplyCapabilityDto {
  // Deliberately the ONLY client-supplied field. Every identity-bearing
  // value (businessId, workspaceId, workspaceAssignmentId, accountRoleId,
  // userId, profileId, roleType, any status) is either taken from the
  // route + authenticated session or resolved server-side -- see
  // resolveOwnerWorkspaceContext(). applicationData is opaque, stored
  // verbatim on the BusinessCapabilityApplication row only, and never
  // interpreted as authority anywhere -- sanitizeApplicationData() still
  // strips any key that collides with a known authority field name as
  // defense in depth (Stage B2 mission §5).
  applicationData?: Record<string, unknown>;
}

interface OwnerWorkspaceContext {
  businessId: number;
  workspaceId: number;
  workspaceAssignmentId: number;
}

const AUTHORITY_LIKE_KEYS = new Set([
  'businessId', 'workspaceId', 'workspaceAssignmentId', 'accountRoleId',
  'userId', 'requestedByUserId', 'profileId', 'roleType', 'status', 'capabilityStatus',
]);

// Business Capability Activation Stage B1/B2. Stage B1 built the pure
// persistence foundation (findPending/findLatest/validateNoPending). Stage
// B2 adds the first real submission orchestration: Business Owner -> Apply
// for COMMERCE -> BusinessCapabilityApplication PENDING + SellerProfile
// PENDING + exact workspace-bound Seller AccountRole PENDING, atomically,
// with ZERO BusinessCapability write -- entitlement is Stage B3's job.
@Injectable()
export class BusinessCapabilityApplicationService {
  constructor(
    @InjectRepository(BusinessCapabilityApplication)
    private readonly applicationRepo: Repository<BusinessCapabilityApplication>,
    @InjectRepository(BusinessCapability)
    private readonly capabilityRepo: Repository<BusinessCapability>,
    private readonly dataSource: DataSource,
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

  /**
   * Business Capability Activation Stage B2. POST /business/:businessId/
   * capabilities/:code/apply's orchestration. See this file's own header
   * comment for the target end state. Never trusts businessId/workspaceId/
   * workspaceAssignmentId/accountRoleId/userId/profileId from the caller --
   * only `businessId` (route param, ownership re-derived server-side) and
   * the authenticated `user` are inputs; everything else is resolved fresh
   * from BusinessMembership/WorkspaceAssignment/SellerProfile/AccountRole.
   */
  async applyForCapability(
    businessId: number,
    codeParam: string,
    user: User,
    dto: ApplyCapabilityDto,
  ) {
    const code = this.parseCapabilityCode(codeParam);

    // Fast-fail pre-checks before opening a transaction -- friendly errors
    // for the common case. Re-run, authoritatively, inside the transaction
    // below (Stage B2 mission §10 step 1-3) since these can race with a
    // concurrent request between here and the transaction's own reads.
    await this.resolveOwnerWorkspaceContext(businessId, user.id);
    if (code !== BusinessCapabilityCode.COMMERCE) {
      // A structurally valid BusinessCapabilityCode (transport/cargo/
      // super_agent) that Stage B simply doesn't implement yet -- never
      // silently treated as Commerce.
      throw new ConflictException({ code: 'CAPABILITY_NOT_SUPPORTED', message: 'CAPABILITY_NOT_SUPPORTED' });
    }
    await this.checkCapabilityNotGranted(businessId, code);
    // (workspaceId isn't known yet at this outer layer without a second
    // resolve call; validateNoPending's own re-check happens inside the
    // transaction using the freshly re-resolved workspaceId instead.)

    try {
      return await this.dataSource.transaction(async (manager) => {
        const context = await this.resolveOwnerWorkspaceContext(businessId, user.id, manager);
        await this.checkCapabilityNotGranted(businessId, code, manager, context.workspaceId);

        const applicationRepo = manager.getRepository(BusinessCapabilityApplication);
        const pending = await applicationRepo.findOne({
          where: { workspaceId: context.workspaceId, capabilityCode: code, status: BusinessCapabilityApplicationStatus.PENDING },
        });
        if (pending) {
          throw new ConflictException({ code: 'CAPABILITY_APPLICATION_ALREADY_PENDING', message: 'CAPABILITY_APPLICATION_ALREADY_PENDING' });
        }

        const businessRepo = manager.getRepository(Business);
        const business = await businessRepo.findOne({ where: { id: businessId } });
        if (!business) throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'BUSINESS_NOT_FOUND' });

        const profile = await this.resolveSellerProfile(manager, business, user);
        const role = await this.resolveSellerAccountRole(manager, user, profile, context.workspaceAssignmentId);

        const applicationRepo2 = manager.getRepository(BusinessCapabilityApplication);
        const application = await applicationRepo2.save(applicationRepo2.create({
          businessId: context.businessId,
          workspaceId: context.workspaceId,
          capabilityCode: code,
          status: BusinessCapabilityApplicationStatus.PENDING,
          requestedByUserId: user.id,
          requestedByWorkspaceAssignmentId: context.workspaceAssignmentId,
          operationalProfileType: RoleProfileType.SELLER_PROFILE,
          operationalProfileId: profile.id,
          applicationData: this.sanitizeApplicationData(dto?.applicationData),
          submittedAt: new Date(),
        }));

        return this.toResponse(application, profile, role, context.businessId, context.workspaceId);
      });
    } catch (e: any) {
      if (this.isUniqueViolation(e, 'UQ_bca_workspace_code_pending')) {
        throw new ConflictException({ code: 'CAPABILITY_APPLICATION_ALREADY_PENDING', message: 'CAPABILITY_APPLICATION_ALREADY_PENDING' });
      }
      if (this.isUniqueViolation(e)) {
        // Any other constraint race (UQ_seller_profile_business, Migration 8's
        // AccountRole uniqueness) -- never leak raw SQL/constraint text to
        // API consumers (Stage B2 mission §11/§30); a concurrent submission
        // colliding on organizational identity is the same class of conflict.
        throw new ConflictException({ code: 'CAPABILITY_APPLICATION_ALREADY_PENDING', message: 'CAPABILITY_APPLICATION_ALREADY_PENDING' });
      }
      throw e;
    }
  }

  // ── SellerProfile resolution/reuse (Stage B2 mission §8) ────────────────
  private async resolveSellerProfile(manager: EntityManager, business: Business, user: User): Promise<SellerProfile> {
    const sellerProfileRepo = manager.getRepository(SellerProfile);
    const existing = await sellerProfileRepo.findOne({ where: { businessId: business.id } });

    if (!existing) {
      // Case A: no SellerProfile for this Business -- create it, deriving
      // every field from the Business record itself (same pattern
      // BusinessService.activateSeller() already established), never from
      // client-supplied identity fields.
      return sellerProfileRepo.save(sellerProfileRepo.create({
        user,
        businessId: business.id,
        businessName: business.tradingName || business.legalName,
        businessDescription: business.description,
        businessCategory: business.category,
        address: business.address,
        phone: business.phone,
        regionId: business.regionId,
        businessRegion: business.region,
        districtId: business.districtId,
        businessDistrict: business.district,
        wardId: business.wardId,
        businessCity: business.ward,
        registrationNumber: business.registrationNumber,
        tinNumber: business.tinNumber,
        businessLicenseNumber: business.businessLicenseNumber,
        sellerType: 'business',
        status: SellerStatus.PENDING,
      }));
    }

    if (existing.status === SellerStatus.REJECTED) {
      // Case B: reapplication after an earlier rejection -- reuse the same
      // operational identity, never fabricate a second one for this Business
      // (UQ_seller_profile_business would reject a second row anyway).
      existing.status = SellerStatus.PENDING;
      existing.rejectionReason = null;
      return sellerProfileRepo.save(existing);
    }

    if (existing.status === SellerStatus.PENDING) {
      // Case C's "orphaned" half: we already confirmed (above, before this
      // method runs) that no LIVE PENDING application exists for this
      // workspace+COMMERCE. A PENDING SellerProfile with no matching
      // application is therefore a historical, pre-Stage-B state (AR37's
      // exact shape: SellerProfile 5 / AccountRole 37, Business "AI Verify
      // Test") -- never silently adopted into the new lifecycle.
      throw new ConflictException({
        code: 'LEGACY_PENDING_COMMERCE_REQUIRES_RECONCILIATION',
        message: 'LEGACY_PENDING_COMMERCE_REQUIRES_RECONCILIATION',
      });
    }

    if (existing.status === SellerStatus.APPROVED) {
      // Case D: an APPROVED profile reaching this point means the earlier
      // checkCapabilityNotGranted() call found NO ACTIVE/SUSPENDED/REVOKED
      // BusinessCapability at all for this workspace+COMMERCE (those are
      // already blocked upstream) -- i.e. an approved operational identity
      // with no corresponding entitlement. A genuine inconsistency; never
      // inferred/repaired here.
      throw new ConflictException({
        code: 'SELLER_APPLICATION_STATE_INCONSISTENT',
        message: 'SELLER_APPLICATION_STATE_INCONSISTENT',
      });
    }

    // Case E (SUSPENDED) and any other status: individual Seller suspension
    // is a completely different lifecycle axis (Stage A2) -- never treated
    // as "eligible to reapply."
    throw new ConflictException({
      code: 'SELLER_APPLICATION_STATE_INCONSISTENT',
      message: 'SELLER_APPLICATION_STATE_INCONSISTENT',
    });
  }

  // ── Seller AccountRole resolution/reuse (Stage B2 mission §9) ───────────
  private async resolveSellerAccountRole(
    manager: EntityManager,
    user: User,
    profile: SellerProfile,
    workspaceAssignmentId: number,
  ): Promise<AccountRole> {
    const accountRoleRepo = manager.getRepository(AccountRole);
    // Exact key per Migration 8's own uniqueness contract -- never a bare
    // (userId, roleType) lookup, which could find a DIFFERENT Business's
    // bound role for the same human.
    const existing = await accountRoleRepo.findOne({
      where: { userId: user.id, roleType: AccountRoleType.SELLER, workspaceAssignmentId },
    });

    if (!existing) {
      return accountRoleRepo.save(accountRoleRepo.create({
        userId: user.id,
        roleType: AccountRoleType.SELLER,
        status: AccountRoleStatus.PENDING,
        profileType: RoleProfileType.SELLER_PROFILE,
        profileId: profile.id,
        capabilities: {},
        contextVersion: 1,
        workspaceAssignmentId,
      }));
    }

    if (existing.status === AccountRoleStatus.REJECTED) {
      existing.status = AccountRoleStatus.PENDING;
      existing.profileId = profile.id;
      existing.statusReason = null;
      existing.contextVersion = existing.contextVersion + 1;
      return accountRoleRepo.save(existing);
    }

    // ACTIVE/PENDING/SUSPENDED reaching here has no consistent explanation
    // given the SellerProfile-side checks above already ran first (a
    // PENDING/ACTIVE/SUSPENDED profile would already have thrown) -- never
    // silently reuse or reactivate a role application submission didn't
    // itself create.
    throw new ConflictException({
      code: 'SELLER_APPLICATION_STATE_INCONSISTENT',
      message: 'SELLER_APPLICATION_STATE_INCONSISTENT',
    });
  }

  /**
   * Business Capability Activation Stage B2 mission §2/§3. Server-derives
   * the ONLY workspace binding this endpoint will ever use, from the
   * authenticated user's own BusinessMembership/WorkspaceAssignment chain
   * -- never from a client-supplied id. Fails closed with a distinct,
   * stable code for each broken link in the chain.
   */
  private async resolveOwnerWorkspaceContext(
    businessId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<OwnerWorkspaceContext> {
    const runner = manager ?? this.dataSource.manager;
    const rows: Array<{
      businessId: number; businessStatus: string;
      workspaceId: number | null; workspaceStatus: string | null;
      membershipId: number | null; membershipStatus: string | null; roleTemplate: string | null;
      workspaceAssignmentId: number | null; assignmentStatus: string | null;
    }> = await runner.query(
      `
      SELECT b.id AS "businessId", b.status AS "businessStatus",
             w.id AS "workspaceId", w.status AS "workspaceStatus",
             bm.id AS "membershipId", bm.status AS "membershipStatus", bm."roleTemplate",
             wa.id AS "workspaceAssignmentId", wa.status AS "assignmentStatus"
      FROM business b
      LEFT JOIN operational_workspace w ON w."businessId" = b.id AND w."isDefault" = true
      LEFT JOIN business_membership bm ON bm."businessId" = b.id AND bm."userId" = $2
      LEFT JOIN workspace_assignment wa ON wa."businessMembershipId" = bm.id AND wa."workspaceId" = w.id
      WHERE b.id = $1
      `,
      [businessId, userId],
    );

    if (!rows.length) throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'BUSINESS_NOT_FOUND' });
    const row = rows[0];

    if (row.businessStatus !== 'active') {
      throw new ConflictException({ code: 'BUSINESS_NOT_ACTIVE', message: 'BUSINESS_NOT_ACTIVE' });
    }
    if (!row.membershipId || row.membershipStatus !== 'active' || row.roleTemplate !== 'owner') {
      throw new ForbiddenException({ code: 'BUSINESS_OWNER_REQUIRED', message: 'BUSINESS_OWNER_REQUIRED' });
    }
    if (!row.workspaceId || row.workspaceStatus !== 'active') {
      throw new ConflictException({ code: 'WORKSPACE_NOT_ACTIVE', message: 'WORKSPACE_NOT_ACTIVE' });
    }
    if (!row.workspaceAssignmentId || row.assignmentStatus !== 'active') {
      throw new ConflictException({ code: 'BUSINESS_WORKSPACE_UNRESOLVED', message: 'BUSINESS_WORKSPACE_UNRESOLVED' });
    }

    return { businessId: row.businessId, workspaceId: row.workspaceId, workspaceAssignmentId: row.workspaceAssignmentId };
  }

  private async checkCapabilityNotGranted(
    businessId: number,
    code: BusinessCapabilityCode,
    manager?: EntityManager,
    knownWorkspaceId?: number,
  ): Promise<void> {
    const workspaceId = knownWorkspaceId ?? (await this.resolveOwnerWorkspaceContextWorkspaceIdOnly(businessId, manager));
    const repo = manager ? manager.getRepository(BusinessCapability) : this.capabilityRepo;
    const capability = await repo.findOne({ where: { workspaceId, capabilityCode: code } });
    if (!capability) return;
    if (capability.status === BusinessCapabilityStatus.ACTIVE) {
      throw new ConflictException({ code: 'CAPABILITY_ALREADY_ACTIVE', message: 'CAPABILITY_ALREADY_ACTIVE' });
    }
    if (capability.status === BusinessCapabilityStatus.SUSPENDED) {
      throw new ConflictException({ code: 'CAPABILITY_SUSPENDED', message: 'CAPABILITY_SUSPENDED' });
    }
    // REVOKED (Stage B2 mission §6): existing BusinessCapability semantics
    // don't establish whether a fresh application should be allowed after
    // revocation -- fail closed rather than guessing or changing capability
    // lifecycle semantics inside this stage.
    throw new ConflictException({
      code: 'CAPABILITY_REVOKED_REQUIRES_RECONCILIATION',
      message: 'CAPABILITY_REVOKED_REQUIRES_RECONCILIATION',
    });
  }

  private async resolveOwnerWorkspaceContextWorkspaceIdOnly(businessId: number, manager?: EntityManager): Promise<number> {
    // Only reached from the OUTER (pre-transaction) pre-check, where the
    // caller hasn't resolved a workspaceId yet -- a lightweight read of the
    // Business's own default workspace, independent of ownership (the
    // outer resolveOwnerWorkspaceContext call already validated ownership
    // moments earlier in applyForCapability()).
    const runner = manager ?? this.dataSource.manager;
    const rows = await runner.query(
      `SELECT id FROM operational_workspace WHERE "businessId" = $1 AND "isDefault" = true`,
      [businessId],
    );
    if (!rows.length) throw new ConflictException({ code: 'BUSINESS_WORKSPACE_UNRESOLVED', message: 'BUSINESS_WORKSPACE_UNRESOLVED' });
    return rows[0].id;
  }

  private parseCapabilityCode(code: string): BusinessCapabilityCode {
    const normalized = (code || '').toLowerCase();
    const valid = (Object.values(BusinessCapabilityCode) as string[]).includes(normalized);
    if (!valid) {
      throw new BadRequestException({ code: 'CAPABILITY_NOT_SUPPORTED', message: 'CAPABILITY_NOT_SUPPORTED' });
    }
    return normalized as BusinessCapabilityCode;
  }

  private sanitizeApplicationData(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (AUTHORITY_LIKE_KEYS.has(key)) continue;
      clean[key] = value;
    }
    return Object.keys(clean).length ? clean : null;
  }

  private isUniqueViolation(e: any, constraintName?: string): boolean {
    const pgCode = e?.code || e?.driverError?.code;
    if (pgCode !== '23505') return false;
    if (!constraintName) return true;
    const text = String(e?.detail || e?.driverError?.detail || e?.message || '');
    return text.includes(constraintName);
  }

  private toResponse(
    application: BusinessCapabilityApplication,
    profile: SellerProfile,
    role: AccountRole,
    businessId: number,
    workspaceId: number,
  ) {
    return {
      application: {
        id: application.id,
        capabilityCode: application.capabilityCode,
        status: application.status,
        submittedAt: application.submittedAt,
      },
      business: { id: businessId },
      workspace: { id: workspaceId },
      operationalProfile: {
        type: RoleProfileType.SELLER_PROFILE,
        id: profile.id,
        status: profile.status,
      },
      accountRole: {
        id: role.id,
        roleType: role.roleType,
        // Always false here by construction -- role.status is always
        // AccountRoleStatus.PENDING at this point, and
        // RoleContextService.isSwitchable() requires ACTIVE. See the
        // dedicated regression test asserting this against the real
        // isSwitchable() implementation (Stage B2 mission §15).
        status: role.status,
        switchable: false,
      },
    };
  }
}
