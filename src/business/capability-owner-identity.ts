import { BadRequestException } from '@nestjs/common';
import { BusinessCapabilityCode } from './entities/business-capability.entity';
import { IdentityVerificationStatus } from '../identity/entities/identity-profile.entity';

/**
 * One shared rule (owner 2026-10-13): selling rights (COMMERCE) and office
 * rights (SUPER_AGENT) of a business become active, at approval or when
 * reactivated after a suspension, only with the person's ID VERIFIED.
 * Transport and service rights are not covered by this rule.
 */
export const CAPABILITIES_NEEDING_VERIFIED_OWNER: ReadonlySet<BusinessCapabilityCode> = new Set([
  BusinessCapabilityCode.COMMERCE,
  BusinessCapabilityCode.SUPER_AGENT,
]);

export const OWNER_NOT_VERIFIED_CODE = 'OWNER_IDENTITY_NOT_VERIFIED';
export const OWNER_NOT_VERIFIED_MESSAGE =
  'Kitambulisho cha mwombaji bado hakijathibitishwa. Thibitisha kitambulisho kwanza.';

/** Throws (before any write by the caller) unless `userId`'s ID is VERIFIED. */
export async function assertCapabilityOwnerVerified(
  verification: { getIdentityProfile(userId: number): Promise<{ status?: string } | null> },
  capabilityCode: BusinessCapabilityCode,
  userId: number | null | undefined,
): Promise<void> {
  if (!CAPABILITIES_NEEDING_VERIFIED_OWNER.has(capabilityCode)) return;
  const identity = userId ? await verification.getIdentityProfile(userId) : null;
  if (identity?.status !== IdentityVerificationStatus.VERIFIED) {
    throw new BadRequestException({ code: OWNER_NOT_VERIFIED_CODE, message: OWNER_NOT_VERIFIED_MESSAGE });
  }
}
