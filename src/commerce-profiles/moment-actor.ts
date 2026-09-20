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

export function momentActorFields(
  profile: Pick<CommerceProfile, 'id' | 'type' | 'displayName' | 'photoUrl' | 'followersCount' | 'isVerified'> | null | undefined,
  fallbackLogo: string | null = null,
): MomentActorFields {
  if (!profile) return { commerceProfileId: null, actorResolved: false, actorType: null };
  return {
    commerceProfileId: profile.id,
    actorResolved: true,
    actorType: actorTypeOf(profile.type),
    name: profile.displayName,
    storeName: profile.displayName,
    logo: profile.photoUrl || fallbackLogo,
    followersCount: profile.followersCount,
    isVerified: profile.isVerified,
  };
}
