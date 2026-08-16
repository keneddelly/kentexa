import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceProfile } from './entities/commerce-profile.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';

// Generalizes SellerScopeService (src/business/seller-scope.service.ts) from
// "one business per seller account" to "any CommerceProfile, owned or
// staffed" — same permission shape, scoped to a specific profile id instead
// of resolving a single default business. SellerScopeService and
// BusinessTeamMember are left untouched; this is what every NEW
// profile-type (hub staff, transport company staff, and sellers acting
// through the profile switcher) builds on going forward.
export type CommerceProfilePermission =
  | 'canViewOrders'
  | 'canCreateOrders'
  | 'canViewCustomers'
  | 'canSendMessages'
  | 'canViewRevenue'
  | 'canManageProducts'
  | 'canManageTeam';

@Injectable()
export class CommerceProfileScopeService {
  constructor(
    @InjectRepository(CommerceProfile)
    private profileRepo: Repository<CommerceProfile>,
    @InjectRepository(CommerceProfileMember)
    private memberRepo: Repository<CommerceProfileMember>,
  ) {}

  // Whether `userId` may act on this specific profile — as its owner, or
  // as an active member with the given permission. Never picks a
  // "default" profile the way SellerScopeService.resolve() does; the
  // caller always already knows which profile it's asking about. Takes a
  // plain id rather than a User entity since every call site here only
  // ever has req.user.id (the JWT payload), not a hydrated User row.
  async isAuthorizedFor(
    userId: number,
    commerceProfileId: number,
    permission?: CommerceProfilePermission,
  ): Promise<boolean> {
    const profile = await this.profileRepo.findOne({
      where: { id: commerceProfileId },
    });
    if (!profile) return false;
    if (profile.ownerId === userId) return true;

    const membership = await this.memberRepo.findOne({
      where: { userId, commerceProfileId, isActive: true },
    });
    return (
      !!membership && (!permission || !!membership.permissions?.[permission])
    );
  }

  async requireAuthorized(
    userId: number,
    commerceProfileId: number,
    permission?: CommerceProfilePermission,
  ): Promise<void> {
    if (!(await this.isAuthorizedFor(userId, commerceProfileId, permission))) {
      throw new ForbiddenException(
        permission
          ? `You don't have the "${permission}" permission for this profile.`
          : 'You are not authorized to manage this profile.',
      );
    }
  }
}
