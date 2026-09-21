import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PayoutPolicyService } from './payout-policy.service';
import { OwnershipFeatureFlagsService } from '../ownership/ownership-feature-flags.service';
import {
  PAYOUT_METHODS,
  PayoutDestination,
  PayoutDestinationStatus,
} from './entities/payout-destination.entity';
import type { RoleContext } from '../role-context/role-context.types';

type OwnerCtx = Pick<RoleContext, 'identityType' | 'workspaceId' | 'userId'>;

/**
 * Business payout destination lifecycle (I2G). Workspace-scoped and
 * append-only; never copied from User.payout*.
 *
 * Authority (initial, NO delegation): the authenticated RoleContext must be
 * BUSINESS for that exact workspace AND the DB must confirm the caller is the
 * Business OWNER (ACTIVE owner membership + ACTIVE workspace assignment).
 * The workspace id is always taken from the context, never from a payload.
 * Verification is an ADMIN action (mechanism/account-name matching is policy,
 * recorded in verificationMethod/verificationRef, not a schema invariant).
 */
@Injectable()
export class PayoutDestinationService {
  constructor(
    private dataSource: DataSource,
    private policy: PayoutPolicyService,
    private flags: OwnershipFeatureFlagsService,
  ) {}

  /** Exact BUSINESS context + Business owner (re-checked in the database). Returns the workspace id. */
  async assertBusinessOwner(ctx: OwnerCtx): Promise<number> {
    if (ctx.identityType !== 'BUSINESS' || ctx.workspaceId == null) {
      throw new ForbiddenException({ code: 'PAYOUT_DESTINATION_BUSINESS_CONTEXT_REQUIRED', message: 'PAYOUT_DESTINATION_BUSINESS_CONTEXT_REQUIRED' });
    }
    const rows = await this.dataSource.query(
      `SELECT 1
         FROM operational_workspace w
         JOIN business b ON b.id = w."businessId" AND b.status::text = 'active'
         JOIN business_membership bm ON bm."businessId" = b.id AND bm."userId" = $2
              AND bm."roleTemplate"::text = 'owner' AND bm.status::text = 'active'
         JOIN workspace_assignment wa ON wa."businessMembershipId" = bm.id AND wa."workspaceId" = w.id AND wa.status::text = 'active'
        WHERE w.id = $1 AND w.status::text = 'active'`,
      [ctx.workspaceId, ctx.userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({ code: 'PAYOUT_DESTINATION_OWNER_REQUIRED', message: 'PAYOUT_DESTINATION_OWNER_REQUIRED' });
    }
    return ctx.workspaceId;
  }

  private assertEnabled() {
    if (!this.flags.isEnabled('BUSINESS_PAYOUT_DESTINATION_ENABLED')) {
      throw new ForbiddenException({ code: 'BUSINESS_PAYOUT_DESTINATION_DISABLED', message: 'BUSINESS_PAYOUT_DESTINATION_DISABLED' });
    }
  }

  async create(
    ctx: OwnerCtx,
    dto: { method: string; accountName: string; accountNumber: string; bankName?: string | null },
  ): Promise<PayoutDestination> {
    this.assertEnabled();
    const workspaceId = await this.assertBusinessOwner(ctx);
    if (!(PAYOUT_METHODS as readonly string[]).includes(dto?.method)) {
      throw new BadRequestException({ code: 'PAYOUT_METHOD_INVALID', message: 'PAYOUT_METHOD_INVALID' });
    }
    const accountName = String(dto.accountName ?? '').trim();
    const accountNumber = String(dto.accountNumber ?? '').trim();
    const bankName = dto.bankName ? String(dto.bankName).trim() : null;
    if (!accountName || !accountNumber || (dto.method === 'bank' && !bankName)) {
      throw new BadRequestException({ code: 'PAYOUT_DESTINATION_INCOMPLETE', message: 'PAYOUT_DESTINATION_INCOMPLETE' });
    }
    const rows = await this.dataSource.query(
      `INSERT INTO payout_destination ("workspaceId", method, "accountName", "accountNumber", "bankName", status, "createdByUserId")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [workspaceId, dto.method, accountName, accountNumber, bankName, PayoutDestinationStatus.PENDING_VERIFICATION, ctx.userId],
    );
    return rows[0];
  }

  /**
   * Admin verification. Fails closed when the cooling-off policy is not
   * configured. The previous ACTIVE destination is superseded in the same
   * transaction; the new one becomes usable only after the configured
   * cooling-off (usableFrom).
   */
  async verify(adminUserId: number, id: number, evidence: { verificationMethod?: string; verificationRef?: string }): Promise<PayoutDestination> {
    this.assertEnabled();
    const coolingOff = this.policy.coolingOffSeconds();
    if (coolingOff === null) {
      throw new ConflictException({ code: 'PAYOUT_POLICY_UNAVAILABLE', message: 'PAYOUT_POLICY_UNAVAILABLE' });
    }
    return this.dataSource.transaction(async (m) => {
      const rows = await m.query(`SELECT * FROM payout_destination WHERE id = $1 FOR UPDATE`, [id]);
      const dest = rows[0];
      if (!dest) throw new NotFoundException({ code: 'PAYOUT_DESTINATION_NOT_FOUND', message: 'PAYOUT_DESTINATION_NOT_FOUND' });
      if (dest.status !== PayoutDestinationStatus.PENDING_VERIFICATION) {
        throw new ConflictException({ code: 'PAYOUT_DESTINATION_NOT_PENDING', message: 'PAYOUT_DESTINATION_NOT_PENDING' });
      }
      await m.query(
        `UPDATE payout_destination SET status = $2 WHERE "workspaceId" = $1 AND status = $3`,
        [dest.workspaceId, PayoutDestinationStatus.SUPERSEDED, PayoutDestinationStatus.ACTIVE],
      );
      const done = await m.query(
        `UPDATE payout_destination
            SET status = $2, "verifiedAt" = now(), "verifiedByUserId" = $3,
                "coolingOffSeconds" = $4::int, "usableFrom" = now() + ($4::int * interval '1 second'),
                "verificationMethod" = $5, "verificationRef" = $6
          WHERE id = $1 RETURNING *`,
        [id, PayoutDestinationStatus.ACTIVE, adminUserId, coolingOff, evidence?.verificationMethod ?? null, evidence?.verificationRef ?? null],
      );
      return done[0];
    });
  }

  async disable(ctx: OwnerCtx, id: number): Promise<PayoutDestination> {
    this.assertEnabled();
    const workspaceId = await this.assertBusinessOwner(ctx);
    const rows = await this.dataSource.query(
      `UPDATE payout_destination SET status = $3, "disabledAt" = now(), "disabledByUserId" = $4
        WHERE id = $1 AND "workspaceId" = $2 AND status IN ('pending_verification','active') RETURNING *`,
      [id, workspaceId, PayoutDestinationStatus.DISABLED, ctx.userId],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'PAYOUT_DESTINATION_NOT_FOUND', message: 'PAYOUT_DESTINATION_NOT_FOUND' });
    return rows[0];
  }

  /** History for the acting Business (owner only). Account numbers are masked. */
  async listForContext(ctx: OwnerCtx) {
    const workspaceId = await this.assertBusinessOwner(ctx);
    const rows: PayoutDestination[] = await this.dataSource.query(
      `SELECT * FROM payout_destination WHERE "workspaceId" = $1 ORDER BY "createdAt" DESC`,
      [workspaceId],
    );
    return rows.map((r) => ({ ...r, accountNumber: r.accountNumber.replace(/.(?=.{4})/g, '*') }));
  }

  /** The destination a withdrawal may use right now; otherwise an explicit refusal (never a fallback). */
  async getUsableDestination(workspaceId: number): Promise<PayoutDestination> {
    const rows = await this.dataSource.query(
      `SELECT * FROM payout_destination WHERE "workspaceId" = $1 AND status = 'active'`,
      [workspaceId],
    );
    const dest = rows[0];
    if (!dest) throw new ConflictException({ code: 'PAYOUT_DESTINATION_REQUIRED', message: 'PAYOUT_DESTINATION_REQUIRED' });
    if (new Date(dest.usableFrom).getTime() > Date.now()) {
      throw new ConflictException({ code: 'PAYOUT_DESTINATION_COOLING_OFF', message: 'PAYOUT_DESTINATION_COOLING_OFF', usableFrom: dest.usableFrom });
    }
    return dest;
  }
}
