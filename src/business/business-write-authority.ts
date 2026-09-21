import { ForbiddenException } from '@nestjs/common';
import type { RoleContext } from '../role-context/role-context.types';

/**
 * I2E. The one reusable server rule for Business-scoped writes:
 *
 *   ACTING BUSINESS = AUTHORIZED BUSINESS = MUTATED BUSINESS
 *
 * - BUSINESS context: the canonical (server-resolved) businessId is
 *   authoritative. A route/body businessId naming ANY other Business --
 *   including another one the same account owns -- is rejected explicitly,
 *   never silently retargeted.
 * - PERSONAL/unbound context (including any legacy unbound Seller/Service/
 *   Transport role, which carries PERSONAL identity): there is nothing to
 *   compare against, so the caller must have named an exact Business, and
 *   the caller's own owner/membership check (unchanged, done by each
 *   service) still decides. Nothing here infers a first/oldest/owned Business,
 *   and a legacy operational role is never Business write authority.
 * - Every other client-supplied identity hint (workspaceAssignmentId,
 *   accountRoleId, profileId, ownerId, ...) is non-authoritative and is never
 *   read as acting authority.
 * - Admin/staff paths do not use this helper; they keep their own explicit
 *   privileged authority.
 */
export const BUSINESS_WRITE_ERROR_CODES = Object.freeze({
  identity: 'BUSINESS_WRITE_IDENTITY_MISMATCH',
  context: 'BUSINESS_WRITE_CONTEXT_MISMATCH',
});

export interface BusinessWriteErrorCodes {
  identity: string;
  context: string;
}

export function assertBusinessWriteTarget(
  businessId: number,
  roleContext: RoleContext | undefined,
  options: { hintedBusinessId?: number | string | null; codes?: BusinessWriteErrorCodes } = {},
): void {
  const codes = options.codes ?? BUSINESS_WRITE_ERROR_CODES;
  const hinted = options.hintedBusinessId;
  if (hinted != null && Number(hinted) !== businessId) {
    throw new ForbiddenException({ code: codes.identity, message: codes.identity });
  }
  if (roleContext?.identityType === 'BUSINESS' && Number(roleContext.businessId) !== businessId) {
    throw new ForbiddenException({ code: codes.context, message: codes.context });
  }
}

/** Only fields a Business owner may edit through the profile/settings write. */
export const BUSINESS_EDITABLE_FIELDS = [
  'legalName', 'tradingName', 'description', 'category', 'logo', 'coverImage', 'address', 'phone', 'email',
] as const;

export function pickBusinessEditableFields(dto: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BUSINESS_EDITABLE_FIELDS) {
    if (dto && Object.prototype.hasOwnProperty.call(dto, key)) out[key] = dto[key];
  }
  return out;
}
