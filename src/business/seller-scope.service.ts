import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { RoleJwtPayload } from '../role-context/role-context.types';

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
  | 'canManageTeam'
  | 'canOperatePOS' // create local-shop/manual sales
  | 'canManageInventory'; // adjust stock, edit cost price, void/refund sales

const OWNS_THEIR_OWN_BUSINESS: AccountRoleType[] = [
  AccountRoleType.SELLER,
  AccountRoleType.ADMIN,
  AccountRoleType.MANAGER,
];

@Injectable()
export class SellerScopeService {
  constructor(
    @InjectRepository(BusinessTeamMember)
    private teamRepo: Repository<BusinessTeamMember>,
    private readonly roleContextService: RoleContextService,
  ) {}

  // Resolves which seller's business `user` may act on right now: their own
  // (if their CURRENTLY ACTIVE role is seller/admin/manager) or an
  // employer's — if they're an active BusinessTeamMember with the required
  // permission. Throws 403 otherwise. A seller who is ALSO staff elsewhere
  // always resolves to their own business here — there's no context
  // switcher yet, so acting on an employer's business currently requires
  // the staff account not itself be active as seller.
  //
  // "Owns own business" is decided from the resolved RoleContext, never
  // from user.role/user.activeRoles: those are legacy, additive-only
  // fields — every role-approval flow (seller/agent/super-agent/transport)
  // unions into activeRoles via mergeActiveRole and never removes prior
  // entries, so an account ever approved as seller keeps 'seller' in
  // activeRoles forever, regardless of which role it's actually operating
  // as now. Trusting that would mean "possessing seller" grants seller
  // authority permanently, exactly what role-switching must prevent — an
  // admin who was once a seller must not silently get seller authority
  // back just because activeRoles never forgot it. Client requests carry
  // no sellerId/profileId of their own here; identity comes only from the
  // server-resolved session (req.user.authPayload -> RoleContextService).
  async resolve(user: User, permission?: SellerPermission): Promise<number> {
    const payload = (user as any).authPayload as RoleJwtPayload | undefined;
    let ownsOwnBusiness = false;
    if (payload?.sub && payload.sid && payload.rid && payload.cv !== undefined) {
      const roleContext = await this.roleContextService.resolveContext(payload);
      ownsOwnBusiness = OWNS_THEIR_OWN_BUSINESS.includes(roleContext.roleType);
    }
    if (ownsOwnBusiness) return user.id;

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
