import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { RoleContext, RoleJwtPayload } from '../role-context/role-context.types';
import { RoleContextException } from '../role-context/role-context.exception';

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

// Business-First Stage 2A. Deliberately a SEPARATE result shape from
// resolve()'s plain number -- never overload resolve()'s return type, so
// none of its ~25 existing callers can ever receive an ambiguous "was that
// a User.id or an OperationalWorkspace.id?" value. legacySellerId is
// exactly what resolve() already returns (or whatever a caller's own
// fallback resolved, e.g. ClassifiedsController's resolve-or-fall-back-to-
// own-account pattern) -- kept only for backward-compatible legacy writes/
// authorization. workspaceId is the NEW authoritative source for a
// workspace-migrated resource, and it is NEVER derived from
// legacySellerId -- see resolveScope() below.
export interface SellerScope {
  legacySellerId: number;
  workspaceId: number | null;
  mode: 'workspace' | 'legacy';
  // Multi-Business Authority Stage 1 (additive). The caller's own resolved
  // RoleContext.profileType/profileId -- i.e. the SPECIFIC SellerProfile (or
  // other operational profile) id the caller's currently-active AccountRole
  // is bound to, when they are genuinely operating as that role themselves.
  // Distinct from workspaceId above (an OperationalWorkspace id, a
  // different Business-First dimension) -- this is the discriminator
  // Conversation.ownerWorkspaceType/ownerWorkspaceId actually mirrors (see
  // conversation.entity.ts's own comment). null whenever the caller isn't
  // resolvable to a real operational profile (e.g. a team member delegated
  // via BusinessTeamMember, acting under their own non-seller active role)
  // -- callers must treat null as "no safe disambiguator", never guess.
  profileType?: string | null;
  profileId?: number | null;
}

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

  /**
   * Business-First Stage 2A. Resolves the WORKSPACE side of a scope for a
   * new authenticated write/read on a migrated resource (Product/
   * Classified). `legacySellerId` is supplied by the caller (already
   * resolved via resolve(), or via that caller's own equivalent fallback)
   * -- this method never re-derives or second-guesses it, and never uses
   * it to derive workspaceId. workspaceId comes ONLY from an authoritative
   * RoleContext.
   *
   * Pass an already-resolved `roleContext` (e.g. from a route already
   * guarded by RoleContextGuard/@CurrentRoleContext) to avoid resolving it
   * twice -- this method trusts it verbatim and does not re-validate it.
   * If omitted, resolves fresh from `user`'s JWT payload -- and FAILS
   * CLOSED (throws RoleContextException) when the payload lacks
   * sid/rid/cv, or when resolveContext() itself rejects (revoked/expired/
   * invalid/suspended/organizationally-revoked). "RoleContext could not be
   * authoritatively established" is never treated as equivalent to "this
   * is an intentionally unresolved legacy Seller" -- the latter is only
   * ever reported (workspaceId: null, mode: 'legacy') when a REAL,
   * validated RoleContext said so.
   */
  async resolveScope(
    legacySellerId: number,
    user: User,
    roleContext?: RoleContext,
  ): Promise<SellerScope> {
    let resolved = roleContext;
    if (!resolved) {
      const payload = (user as any).authPayload as RoleJwtPayload | undefined;
      if (!payload?.sub || !payload.sid || !payload.rid || payload.cv === undefined) {
        throw new RoleContextException('ROLE_CONTEXT_MISSING');
      }
      resolved = await this.roleContextService.resolveContext(payload);
    }
    const workspaceId = resolved.workspaceId ?? null;
    return {
      legacySellerId,
      workspaceId,
      mode: workspaceId != null ? 'workspace' : 'legacy',
      profileType: resolved.profileType ?? null,
      profileId: resolved.profileId ?? null,
    };
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
