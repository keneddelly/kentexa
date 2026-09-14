import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessCapability, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { User } from '../users/entities/user.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { ORGANIZATIONAL_CAPABILITY_BY_ROLE } from '../role-context/organizational-capability';
import { RoleContextService } from '../role-context/role-context.service';

/**
 * Business Capability Activation Stage B4.0 (schema) / B4 (this file):
 * organizational entitlement lifecycle -- ACTIVE <-> SUSPENDED -- for an
 * EXISTING BusinessCapability. Deliberately separate from Stage B1-B3's
 * BusinessCapabilityApplicationService: B1-B3 govern how a capability gets
 * granted in the first place (an application's own PENDING/APPROVED/
 * REJECTED lifecycle); this file only ever mutates a capability that
 * already exists, and never touches BusinessCapabilityApplication.
 *
 * Two-axis authority model (mission §1): BusinessCapability is
 * ORGANIZATIONAL entitlement ("can this workspace operate Commerce at
 * all"), never HUMAN authority ("is this person's Seller AccountRole
 * allowed to act"). Suspending a capability must never touch AccountRole
 * status -- RoleContextService.resolveOrganizationalContext (unchanged by
 * this file) already fails every request for a bound role whose required
 * capability isn't ACTIVE, live, on every call, so entitlement enforcement
 * needs no new code here at all -- only the transition + audit + proactive
 * session revocation for whatever was already connected.
 */
@Injectable()
export class BusinessCapabilityLifecycleService {
  constructor(
    @InjectRepository(BusinessCapability)
    private readonly capabilityRepo: Repository<BusinessCapability>,
    private readonly dataSource: DataSource,
    private readonly roleContextService: RoleContextService,
  ) {}

  /**
   * POST /admin/business-capabilities/:id/suspend. `id` is the sole
   * identity taken from the route; `reason` is the only body field ever
   * read. businessId/workspaceId/capabilityCode/status/every actor or
   * profile id is resolved server-side from the persisted capability row
   * and the authenticated admin -- never trusted from the request.
   */
  async suspend(id: number, admin: User, reason: string) {
    const trimmedReason = (reason ?? '').trim();
    if (trimmedReason.length < 3 || trimmedReason.length > 1000) {
      throw new BadRequestException({ code: 'SUSPENSION_REASON_REQUIRED', message: 'SUSPENSION_REASON_REQUIRED' });
    }

    const { capability, mutated } = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BusinessCapability);
      const cap = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!cap) {
        throw new NotFoundException({ code: 'BUSINESS_CAPABILITY_NOT_FOUND', message: 'BUSINESS_CAPABILITY_NOT_FOUND' });
      }

      if (cap.status === BusinessCapabilityStatus.REVOKED) {
        // A genuinely different terminal state this stage never touches --
        // fail closed rather than silently reinterpreting REVOKED as a
        // suspendable ACTIVE-like state.
        throw new ConflictException({ code: 'BUSINESS_CAPABILITY_REVOKED', message: 'BUSINESS_CAPABILITY_REVOKED' });
      }

      if (cap.status === BusinessCapabilityStatus.SUSPENDED) {
        // Idempotent retry (mission §15): a lost-response retry of an
        // already-successful suspend must never overwrite the ORIGINAL
        // suspendedAt/suspendedByUserId/statusReason with new values from
        // this later call -- return the existing row completely untouched.
        return { capability: cap, mutated: false };
      }

      // ACTIVE -> SUSPENDED. approvedAt/approvedByUserId (original grant
      // provenance) and reactivatedAt/reactivatedByUserId (if this
      // capability was previously reactivated after an earlier suspension)
      // are deliberately left exactly as they were -- each audit field pair
      // records only the most recent occurrence of ITS OWN event type, and
      // is never cleared just because a different-direction transition
      // happened (mission §7: "do not fabricate reactivation metadata," and
      // symmetrically here, never erase real historical reactivation
      // metadata either).
      cap.status = BusinessCapabilityStatus.SUSPENDED;
      cap.suspendedAt = new Date();
      cap.suspendedByUserId = admin.id;
      cap.statusReason = trimmedReason;
      await repo.save(cap);
      return { capability: cap, mutated: true };
    });

    if (mutated) {
      // Proactive session revocation (mission §9) -- best-effort on top of
      // enforcement that is ALREADY live via resolveOrganizationalContext
      // regardless of this step's outcome. Scoped to the capability's own
      // exact workspaceId and only the AccountRole roleType(s) this
      // capability code actually gates (ORGANIZATIONAL_CAPABILITY_BY_ROLE),
      // reusing RoleContextService.revokeSessionsForAccountRole verbatim --
      // no parallel revocation mechanism.
      await this.revokeSessionsForCapabilityWorkspace(capability, `capability_suspended_${capability.capabilityCode}`);
    }

    return this.toResponse(capability);
  }

  /**
   * POST /admin/business-capabilities/:id/reactivate. Mirrors suspend()'s
   * locking/idempotency discipline. Deliberately performs NO session or
   * AccountRole mutation of any kind (mission §12): no new
   * ActiveRoleSession, no JWT, no restoring sessions revoked at suspension
   * time, no touching AccountRole.status. A workspace-bound Seller
   * AccountRole that is itself still ACTIVE becomes switchable again purely
   * because RoleContextService.resolveOrganizationalContext now finds an
   * ACTIVE capability on the next /auth/switch-role or request -- an
   * individually SUSPENDED AccountRole remains SUSPENDED regardless of this
   * call, exactly as the two-axis model requires.
   */
  async reactivate(id: number, admin: User) {
    const { capability } = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BusinessCapability);
      const cap = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!cap) {
        throw new NotFoundException({ code: 'BUSINESS_CAPABILITY_NOT_FOUND', message: 'BUSINESS_CAPABILITY_NOT_FOUND' });
      }

      if (cap.status === BusinessCapabilityStatus.REVOKED) {
        throw new ConflictException({ code: 'BUSINESS_CAPABILITY_REVOKED', message: 'BUSINESS_CAPABILITY_REVOKED' });
      }

      if (cap.status === BusinessCapabilityStatus.ACTIVE) {
        // Idempotent retry -- never overwrite the original
        // reactivatedAt/reactivatedByUserId (or, for the very first
        // approval, leave reactivatedAt/By untouched at null) with a new
        // value from this later call.
        return { capability: cap, mutated: false };
      }

      // SUSPENDED -> ACTIVE. approvedAt/approvedByUserId are never touched
      // here -- reactivation is not a new approval (mission §8).
      // suspendedAt/suspendedByUserId are deliberately PRESERVED (not
      // cleared) as the historical record of the most recent suspension;
      // statusReason is cleared because it describes why the capability
      // was suspended, which no longer applies once status is ACTIVE again.
      cap.status = BusinessCapabilityStatus.ACTIVE;
      cap.reactivatedAt = new Date();
      cap.reactivatedByUserId = admin.id;
      cap.statusReason = null;
      await repo.save(cap);
      return { capability: cap, mutated: true };
    });

    return this.toResponse(capability);
  }

  /**
   * Finds every AccountRole bound (via WorkspaceAssignment) to this exact
   * workspaceId whose roleType this capability code actually gates, then
   * revokes that role's sessions through the existing, unmodified
   * RoleContextService primitive -- same DB update, same socket-invalidation
   * event emission every other caller of it gets. Never scopes by userId or
   * roleType alone (mission §13): a role bound to a DIFFERENT workspace,
   * even for the same human, is never matched by the workspaceId join.
   */
  private async revokeSessionsForCapabilityWorkspace(capability: BusinessCapability, reason: string): Promise<void> {
    const gatedRoleTypes = (Object.entries(ORGANIZATIONAL_CAPABILITY_BY_ROLE) as Array<[AccountRoleType, string]>)
      .filter(([, code]) => code === capability.capabilityCode)
      .map(([roleType]) => roleType);
    if (!gatedRoleTypes.length) return;

    const rows: Array<{ id: number }> = await this.dataSource.query(
      `
      SELECT ar.id
      FROM account_role ar
      JOIN workspace_assignment wa ON wa.id = ar."workspaceAssignmentId"
      WHERE wa."workspaceId" = $1
        AND ar."roleType" = ANY($2::text[])
      `,
      [capability.workspaceId, gatedRoleTypes],
    );

    for (const row of rows) {
      await this.roleContextService.revokeSessionsForAccountRole(row.id, reason);
    }
  }

  private toResponse(capability: BusinessCapability) {
    return {
      capability: {
        id: capability.id,
        workspaceId: capability.workspaceId,
        capabilityCode: capability.capabilityCode,
        status: capability.status,
        approvedAt: capability.approvedAt,
        approvedByUserId: capability.approvedByUserId,
        suspendedAt: capability.suspendedAt,
        suspendedByUserId: capability.suspendedByUserId,
        statusReason: capability.statusReason,
        reactivatedAt: capability.reactivatedAt,
        reactivatedByUserId: capability.reactivatedByUserId,
      },
    };
  }
}
