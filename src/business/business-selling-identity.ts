import { ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/**
 * THE canonical Business Selling identity invariant. Every path that can
 * initiate or activate Selling for a Business -- generic capability apply
 * (which POST /business/:id/connect-selling delegates to), engine approval,
 * legacy SellerService.approve for Business-linked profiles, and legacy
 * activate-seller -- calls this same function, so no entry point can create a
 * Business-bound Seller whose acting identity would be ambiguous.
 *
 * Validates, from the database only (never from a request):
 *  1. the exact Business exists and is active;
 *  2. its workspace (the given one, else the default) belongs to THAT
 *     Business and is active;
 *  3. an ACTIVE workspace assignment exists for the Business's active OWNER
 *     membership in that workspace;
 *  4. exactly ONE CommerceProfile is canonically linked to the Business
 *     (`businessId = this Business`). Unlinked legacy profiles carry no
 *     businessId, so they are never counted -- and no profile is ever
 *     chosen by owner, name, age, seller link or type guess;
 *  5. that profile is of type BUSINESS and owned by the Business owner
 *     (Business / Workspace / CommerceProfile relationships agree).
 *
 * The predicate in (4) is deliberately identical to what RoleContextService
 * uses to resolve a BUSINESS context's commerceProfileId, so anything this
 * accepts can actually publish as the Business afterwards.
 */
export const BUSINESS_SELLING_IDENTITY_CODES = Object.freeze({
  NOT_FOUND: 'BUSINESS_NOT_FOUND',
  NOT_ACTIVE: 'BUSINESS_NOT_ACTIVE',
  WORKSPACE_NOT_ACTIVE: 'WORKSPACE_NOT_ACTIVE',
  WORKSPACE_UNRESOLVED: 'BUSINESS_WORKSPACE_UNRESOLVED',
  PROFILE_CARDINALITY: 'BUSINESS_PROFILE_CARDINALITY_INVALID',
  PROFILE_RELATIONSHIP: 'BUSINESS_PROFILE_RELATIONSHIP_INVALID',
});

export interface BusinessSellingIdentity {
  businessId: number;
  workspaceId: number;
  ownerUserId: number;
  commerceProfileId: number;
}

export type BusinessSellingIdentityResult =
  | { ok: true; identity: BusinessSellingIdentity }
  | { ok: false; code: string; workspaceId: number | null };

type Runner = Pick<EntityManager, 'query'>;

export async function evaluateBusinessSellingIdentity(
  runner: Runner,
  businessId: number,
  workspaceId?: number,
): Promise<BusinessSellingIdentityResult> {
  const C = BUSINESS_SELLING_IDENTITY_CODES;
  const rows: Array<{
    businessStatus: string; workspaceId: number | null; workspaceStatus: string | null;
    ownerUserId: number | null; assignmentId: number | null; assignmentStatus: string | null;
  }> = await runner.query(
    `
    SELECT b.status AS "businessStatus",
           w.id AS "workspaceId", w.status AS "workspaceStatus",
           bm."userId" AS "ownerUserId",
           wa.id AS "assignmentId", wa.status AS "assignmentStatus"
    FROM business b
    LEFT JOIN operational_workspace w
      ON w."businessId" = b.id AND (w.id = $2::int OR ($2::int IS NULL AND w."isDefault" = true))
    LEFT JOIN business_membership bm
      ON bm."businessId" = b.id AND bm."roleTemplate" = 'owner' AND bm.status = 'active'
    LEFT JOIN workspace_assignment wa
      ON wa."businessMembershipId" = bm.id AND wa."workspaceId" = w.id
    WHERE b.id = $1
    `,
    [businessId, workspaceId ?? null],
  );
  if (!rows.length) return { ok: false, code: C.NOT_FOUND, workspaceId: null };
  const row = rows[0];
  const knownWorkspaceId = row.workspaceId ?? null;

  if (row.businessStatus !== 'active') return { ok: false, code: C.NOT_ACTIVE, workspaceId: knownWorkspaceId };
  if (!row.workspaceId || row.workspaceStatus !== 'active') return { ok: false, code: C.WORKSPACE_NOT_ACTIVE, workspaceId: knownWorkspaceId };
  if (!row.ownerUserId || !row.assignmentId || row.assignmentStatus !== 'active') {
    return { ok: false, code: C.WORKSPACE_UNRESOLVED, workspaceId: knownWorkspaceId };
  }

  const profiles: Array<{ id: number; type: string; ownerId: number }> = await runner.query(
    `SELECT id, type::text AS type, "ownerId" FROM commerce_profile WHERE "businessId" = $1`,
    [businessId],
  );
  if (profiles.length !== 1) return { ok: false, code: C.PROFILE_CARDINALITY, workspaceId: knownWorkspaceId };
  const profile = profiles[0];
  if (profile.type !== 'business' || Number(profile.ownerId) !== Number(row.ownerUserId)) {
    return { ok: false, code: C.PROFILE_RELATIONSHIP, workspaceId: knownWorkspaceId };
  }

  return {
    ok: true,
    identity: { businessId, workspaceId: row.workspaceId, ownerUserId: Number(row.ownerUserId), commerceProfileId: profile.id },
  };
}

/** Throws the explicit code when the Business cannot carry a Business-bound Seller identity. */
export async function assertBusinessSellingIdentity(
  runner: Runner,
  businessId: number,
  workspaceId?: number,
): Promise<BusinessSellingIdentity> {
  const result = await evaluateBusinessSellingIdentity(runner, businessId, workspaceId);
  if (result.ok === true) return result.identity;
  const failure = result as { ok: false; code: string };
  if (failure.code === BUSINESS_SELLING_IDENTITY_CODES.NOT_FOUND) {
    throw new NotFoundException({ code: failure.code, message: failure.code });
  }
  throw new ConflictException({ code: failure.code, message: failure.code });
}
