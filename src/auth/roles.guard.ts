import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/entities/user.entity';

const ROLE_HIERARCHY: Record<string, string[]> = {
  [UserRole.ADMIN]: [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.CUSTOMER_CARE,
    UserRole.SUPER_AGENT,
    UserRole.AGENT,
    UserRole.TRANSPORT_PROVIDER,
    UserRole.SELLER,
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
  [UserRole.USER]: [UserRole.USER],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Not authenticated');

    // user.role (singular) is last-writer-wins — every role-approval flow
    // (seller/agent/super-agent/transport) unconditionally overwrites it to
    // its own value, while those same flows also correctly ADD to
    // user.activeRoles (a Set union, never removes prior entries — see
    // mergeActiveRole / SellerScopeService.resolve()'s comment for the full
    // story). Checking user.role alone means an account that became a
    // seller and was LATER also approved as e.g. transport provider loses
    // access to every seller-gated endpoint, even though activeRoles still
    // genuinely lists 'seller'. Union in the hierarchy for every role the
    // user actually holds, not just their current primary one — this only
    // ever WIDENS what role alone would have allowed, never narrows it.
    const userRole = user.role as string;
    const allowedRoles = new Set<string>(ROLE_HIERARCHY[userRole] || [userRole]);
    for (const r of user.activeRoles || []) {
      for (const allowed of ROLE_HIERARCHY[r] || [r]) allowedRoles.add(allowed);
    }
    const hasPermission = required.some((role) => allowedRoles.has(role));

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required: ${required.join(' or ')}. Your role: ${userRole}`,
      );
    }

    return true;
  }
}
