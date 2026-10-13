import { BadRequestException } from '@nestjs/common';
import { LessThan, Raw } from 'typeorm';

/**
 * Service ads and the poster's ID (owner 2026-10-13, decision S1):
 *  - posting needs the ID sent (a waiting ID is fine);
 *  - an ad posted from SERVICE_AD_RULE_START on is shown to customers only
 *    while the poster's ID is VERIFIED -- it appears by itself the moment the
 *    ID is verified, with no extra admin step (this is a live check, not a
 *    stored flag);
 *  - ads posted before SERVICE_AD_RULE_START stay visible as before.
 * Classified ads are not covered by this rule.
 */
export const SERVICE_AD_RULE_START = '2026-10-14T00:00:00+03:00';

const verifiedPoster = (posterIdColumn: string) =>
  `EXISTS (SELECT 1 FROM public.identity_profile sip WHERE sip."userId" = ${posterIdColumn} AND sip.status::text = 'verified')`;

/** SQL condition for a query builder alias, e.g. qb.andWhere(PUBLIC_SERVICE_AD('s')). */
export const PUBLIC_SERVICE_AD = (alias: string) =>
  `(${alias}."createdAt" < '${SERVICE_AD_RULE_START}' OR ${verifiedPoster(`${alias}."providerId"`)})`;

/**
 * The same condition for repository find() options, as two alternatives (OR):
 * created before the rule start, or the poster's ID is verified.
 * Usage: find({ where: publicServiceAdWhere({ status: ServiceStatus.ACTIVE, ... }) }).
 * Each Raw() only touches its own column, so it is safe in every find() shape.
 */
export const publicServiceAdWhere = <T extends Record<string, any>>(base: T & { providerId?: number }) => {
  const verifiedIn = (col: string) =>
    `${col} IN (SELECT sip."userId" FROM public.identity_profile sip WHERE sip.status::text = 'verified')`;
  const fixedPoster = base.providerId != null ? Number(base.providerId) : null;
  return [
    { ...base, createdAt: LessThan(new Date(SERVICE_AD_RULE_START)) },
    { ...base, providerId: Raw((col) => (fixedPoster != null ? `${col} = ${fixedPoster} AND ${verifiedIn(col)}` : verifiedIn(col))) },
  ];
};

/** For the poster's own list: is this ad hidden only because their ID is not verified yet? */
export const waitingForPosterId = (ad: { createdAt?: Date | string | null }, posterIdStatus?: string | null) =>
  !!ad.createdAt && new Date(ad.createdAt).getTime() >= new Date(SERVICE_AD_RULE_START).getTime() && posterIdStatus !== 'verified';

export const SERVICE_POST_MESSAGES = {
  identityFirst: 'Tuma kitambulisho chako kwanza, kisha weka tangazo la huduma.',
  identityRejected: 'Kitambulisho chako kilikataliwa. Kituma tena kwanza.',
} as const;

/**
 * Posting a service ad needs the poster's ID sent in (waiting or verified).
 * Returns the ID status so the caller knows whether the new ad is public yet.
 */
export async function assertServicePosterIdSent(
  verification: { getIdentityProfile(userId: number): Promise<{ status?: string } | null> },
  userId: number,
): Promise<'pending' | 'verified'> {
  const status = (await verification.getIdentityProfile(userId))?.status;
  if (status === 'rejected') throw new BadRequestException(SERVICE_POST_MESSAGES.identityRejected);
  if (status !== 'pending' && status !== 'verified') throw new BadRequestException(SERVICE_POST_MESSAGES.identityFirst);
  return status;
}
