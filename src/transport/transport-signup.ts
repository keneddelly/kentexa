import { BadRequestException } from '@nestjs/common';

/**
 * Msafirishaji (owner 2026-10-14): the same rule as the other work roles.
 * Applying needs the ID sent (a waiting ID is fine); an admin approves, or
 * brings back a suspended provider, only with the owner's ID VERIFIED.
 * Providers already approved are never re-checked.
 */
export const TRANSPORT_SIGNUP_MESSAGES = {
  identityFirst: 'Tuma kitambulisho chako kwanza, kisha omba kuwa msafirishaji.',
  identityRejected: 'Kitambulisho chako kilikataliwa. Kituma tena kwanza.',
  approveNeedsVerified: 'Kitambulisho cha msafirishaji huyu bado hakijathibitishwa. Thibitisha kitambulisho kwanza.',
} as const;

type IdentityReader = { getIdentityProfile(userId: number): Promise<{ status?: string } | null> };

/** Applying: the ID must be sent (waiting or verified). */
export async function assertTransportIdSent(verification: IdentityReader, userId: number): Promise<void> {
  const status = (await verification.getIdentityProfile(userId))?.status;
  if (status === 'rejected') throw new BadRequestException(TRANSPORT_SIGNUP_MESSAGES.identityRejected);
  if (status !== 'pending' && status !== 'verified') throw new BadRequestException(TRANSPORT_SIGNUP_MESSAGES.identityFirst);
}

/** Approving (or bringing back) a provider: the owner's ID must be VERIFIED. */
export async function assertTransportOwnerVerified(verification: IdentityReader, userId: number | null | undefined): Promise<void> {
  const status = userId ? (await verification.getIdentityProfile(userId))?.status : null;
  if (status !== 'verified') throw new BadRequestException(TRANSPORT_SIGNUP_MESSAGES.approveNeedsVerified);
}
