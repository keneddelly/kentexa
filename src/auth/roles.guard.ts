import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { RoleContextException } from '../role-context/role-context.exception';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { RoleJwtPayload } from '../role-context/role-context.types';

/**
 * Authority hierarchy evaluated against a single CURRENTLY ACTIVE role, never
 * a union of every role an account happens to possess. An admin operating as
 * seller does not get admin authority back until they switch the active role
 * to admin again.
 */
const ACTIVE_ROLE_HIERARCHY: Record<string, string[]> = {
  [UserRole.ADMIN]: [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.CUSTOMER_CARE,
    UserRole.SUPER_AGENT,
    UserRole.AGENT,
    UserRole.TRANSPORT_PROVIDER,
    UserRole.SELLER,
    UserRole.ARBITRATOR,
    UserRole.USER,
  ],
  [UserRole.MANAGER]: [
    UserRole.MANAGER,
    UserRole.CUSTOMER_CARE,
    UserRole.SUPER_AGENT,
    UserRole.AGENT,
    UserRole.TRANSPORT_PROVIDER,
    UserRole.SELLER,
    UserRole.USER,
  ],
  [UserRole.CUSTOMER_CARE]: [UserRole.CUSTOMER_CARE, UserRole.USER],
  [UserRole.SUPER_AGENT]: [UserRole.SUPER_AGENT, UserRole.USER],
  [UserRole.AGENT]: [UserRole.AGENT, UserRole.USER],
  [UserRole.TRANSPORT_PROVIDER]: [UserRole.TRANSPORT_PROVIDER, UserRole.USER],
  [UserRole.SELLER]: [UserRole.SELLER, UserRole.USER],
  [UserRole.ARBITRATOR]: [UserRole.ARBITRATOR, UserRole.USER],
  [UserRole.USER]: [UserRole.USER],
};

/** AccountRoleType (the new active-role space) has no legacy USER/service_provider counterpart used by @Roles(). */
const ACCOUNT_ROLE_TO_USER_ROLE: Partial<Record<AccountRoleType, UserRole>> = {
  [AccountRoleType.BUYER]: UserRole.USER,
  [AccountRoleType.SELLER]: UserRole.SELLER,
  [AccountRoleType.AGENT]: UserRole.AGENT,
  [AccountRoleType.SUPER_AGENT]: UserRole.SUPER_AGENT,
  [AccountRoleType.TRANSPORT_PROVIDER]: UserRole.TRANSPORT_PROVIDER,
  [AccountRoleType.CUSTOMER_CARE]: UserRole.CUSTOMER_CARE,
  [AccountRoleType.MANAGER]: UserRole.MANAGER,
  [AccountRoleType.ADMIN]: UserRole.ADMIN,
  [AccountRoleType.ARBITRATOR]: UserRole.ARBITRATOR,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly roleContextService: RoleContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Not authenticated');

    // Authority is resolved from the caller's CURRENT active role/session,
    // never from user.role or user.activeRoles (legacy, additive-only fields
    // that keep every role a user was ever approved for — see
    // SellerScopeService.resolve()'s comment for the full history of that
    // problem). A forged/stale `rt` claim cannot substitute: roleType always
    // comes from the DB row RoleContextService resolves via sid/rid/cv.
    const payload = user.authPayload as RoleJwtPayload | undefined;
    if (!payload?.sub || !payload.sid || !payload.rid || payload.cv === undefined) {
      throw new RoleContextException('ROLE_CONTEXT_MISSING');
    }
    const roleContext = await this.roleContextService.resolveContext(payload);
    request.roleContext = roleContext;

    const activeUserRole = ACCOUNT_ROLE_TO_USER_ROLE[roleContext.roleType];
    const allowedRoles = new Set<string>(
      (activeUserRole && ACTIVE_ROLE_HIERARCHY[activeUserRole]) || (activeUserRole ? [activeUserRole] : []),
    );
    const hasPermission = required.some((role) => allowedRoles.has(role));

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required: ${required.join(' or ')}. Your active role: ${roleContext.roleType}`,
      );
    }

    return true;
  }
}
