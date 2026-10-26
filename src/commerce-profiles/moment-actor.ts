import { CommerceProfile, CommerceProfileType } from './entities/commerce-profile.entity';

/**
 * I2B. THE canonical public-actor read model for Moments/feed/story rows.
 * The exact stamped CommerceProfile is the ONLY identity source: a row whose
 * commerceProfileId is null (or points at a missing profile) is reported as
 * actorResolved:false -- never re-derived from the owner (ownerId, first
 * Business, personal default). Consumers must not navigate/message to a
 * guessed profile for an unresolved actor.
 */
export type MomentActorType = 'PERSONAL' | 'BUSINESS' | 'OTHER';

export interface MomentActorFields {
  commerceProfileId: number | null;
  actorResolved: boolean;
  actorType: MomentActorType | null;
  name?: string;
  storeName?: string;
  logo?: string | null;
  followersCount?: number;
  isVerified?: boolean;
}

const actorTypeOf = (type: CommerceProfileType): MomentActorType =>
  type === CommerceProfileType.PERSONAL ? 'PERSONAL' : type === CommerceProfileType.BUSINESS ? 'BUSINESS' : 'OTHER';

/**
 * ONE rule for the verified tick, everywhere (owner 2026-10-26: "verified pages such
 * as KenteXa and BiS show the tick in the marketplace but not in the home feed").
 * Same rule as the profile page: the profile itself is verified, or it is a business
 * profile of an official KenteXa store. Never User.isVerified - that only means the
 * phone number passed OTP, not that KenteXa verified the identity.
 */
export function identityVerified(
  profile: Pick<CommerceProfile, 'type' | 'isVerified'> | null | undefined,
  ownerIsOfficialStore?: boolean | null,
): boolean {
  if (profile) return !!profile.isVerified || (profile.type === CommerceProfileType.BUSINESS && !!ownerIsOfficialStore);
  return !!ownerIsOfficialStore;
}

export function momentActorFields(
  profile: Pick<CommerceProfile, 'id' | 'type' | 'displayName' | 'photoUrl' | 'followersCount' | 'isVerified'> | null | undefined,
  fallbackLogo: string | null = null,
  ownerIsOfficialStore: boolean | null = null,
): MomentActorFields {
  // Unresolved actor: still no account-level guess at verification (the raw owner
  // row's isVerified is only the OTP flag) - an official store owner keeps its tick.
  if (!profile) return { commerceProfileId: null, actorResolved: false, actorType: null, isVerified: !!ownerIsOfficialStore };
  return {
    commerceProfileId: profile.id,
    actorResolved: true,
    actorType: actorTypeOf(profile.type),
    name: profile.displayName,
    storeName: profile.displayName,
    logo: profile.photoUrl || fallbackLogo,
    followersCount: profile.followersCount,
    isVerified: identityVerified(profile, ownerIsOfficialStore),
  };
}
