import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { User, UserRole } from '../users/entities/user.entity';

// Keep in sync with BusinessTeamMember.permissions and
// bishoo-frontend/src/public/pages/SellerTeam.js's PERMS list — these are
// the only grantable permissions today; endpoints get mapped onto the
// closest fit rather than growing the permission set.
export type SellerPermission =
  | 'canViewOrders'
  | 'canCreateOrders'
  | 'canViewCustomers'
  | 'canSendMessages'
  | 'canViewRevenue'
  | 'canManageProducts'
  | 'canManageTeam';

const OWNS_THEIR_OWN_BUSINESS = [
  UserRole.SELLER,
  UserRole.ADMIN,
  UserRole.MANAGER,
];

@Injectable()
export class SellerScopeService {
  constructor(
    @InjectRepository(BusinessTeamMember)
    private teamRepo: Repository<BusinessTeamMember>,
  ) {}

  // Resolves which seller's business `user` may act on right now: their own
  // (if they're a seller/admin/manager themselves) or an employer's — if
  // they're an active BusinessTeamMember with the required permission.
  // Throws 403 otherwise. A seller who is ALSO staff elsewhere always
  // resolves to their own business here — there's no context switcher yet,
  // so acting on an employer's business currently requires the staff
  // account not itself be a seller.
  async resolve(user: User, permission?: SellerPermission): Promise<number> {
    if (OWNS_THEIR_OWN_BUSINESS.includes(user.role)) return user.id;

    const membership = await this.teamRepo.findOne({
      where: { userId: user.id, isActive: true },
    });

    if (membership && (!permission || membership.permissions?.[permission])) {
      return membership.sellerId;
    }

    throw new ForbiddenException(
      permission
        ? `You don't have the "${permission}" permission for this business.`
        : 'You are not authorized to manage this business.',
    );
  }

  // For multi-party checks (buyer OR seller OR admin, already ORed
  // together elsewhere) where the target business is already known — e.g.
  // from an already-loaded order. Unlike resolve(), this doesn't pick a
  // "default" business for the caller, it just answers whether `user` may
  // act for this SPECIFIC one, so it can be added as one more OR branch
  // without disturbing the existing buyer/admin checks.
  async isAuthorizedFor(
    user: User,
    targetSellerId: number,
    permission?: SellerPermission,
  ): Promise<boolean> {
    if (user.id === targetSellerId) return true;
    const membership = await this.teamRepo.findOne({
      where: { userId: user.id, sellerId: targetSellerId, isActive: true },
    });
    return (
      !!membership && (!permission || !!membership.permissions?.[permission])
    );
  }
}
