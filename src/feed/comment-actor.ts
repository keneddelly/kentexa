import { ConflictException } from '@nestjs/common';
import type { RoleContext } from '../role-context/role-context.types';

/**
 * I2F comment/reply actor: AUTHENTICATED ROLE CONTEXT = ACTING IDENTITY = STORED ACTOR.
 * The acting CommerceProfile is read ONLY from the server-resolved RoleContext. Any
 * commerceProfileId the client sends is ignored -- it can neither choose nor spoof the actor
 * (Business B submitting Business A's profile id still stamps B).
 *
 *  - BUSINESS context: the exact Business CommerceProfile; if it cannot be resolved the write
 *    fails explicitly (ACTOR_IDENTITY_UNRESOLVED) -- never a guess or a fallback.
 *  - PERSONAL context (incl. a legacy unbound Seller, per I2A): the person's Personal profile,
 *    or null when the account has none (the comment stays attributed to the user id; nothing is
 *    fabricated).
 */
export function resolveCommentActorProfileId(roleContext: RoleContext | undefined | null): number | null {
  if (!roleContext) {
    throw new ConflictException({ code: 'ACTOR_IDENTITY_UNRESOLVED', message: 'ACTOR_IDENTITY_UNRESOLVED' });
  }
  if (roleContext.identityType === 'BUSINESS') {
    if (!roleContext.commerceProfileId || roleContext.businessId == null) {
      throw new ConflictException({ code: 'ACTOR_IDENTITY_UNRESOLVED', message: 'ACTOR_IDENTITY_UNRESOLVED' });
    }
    return roleContext.commerceProfileId;
  }
  return roleContext.commerceProfileId ?? null;
}
