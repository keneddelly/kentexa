import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/entities/user.entity';

const ROLE_HIERARCHY: Record<string, string[]> = {
  [UserRole.ADMIN]: [
    UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER_CARE,
    UserRole.SUPER_AGENT, UserRole.AGENT, UserRole.SELLER, UserRole.USER,
  ],
  [UserRole.MANAGER]: [
    UserRole.MANAGER, UserRole.CUSTOMER_CARE,
    UserRole.SUPER_AGENT, UserRole.AGENT, UserRole.SELLER, UserRole.USER,
  ],
  [UserRole.CUSTOMER_CARE]: [
    UserRole.CUSTOMER_CARE, UserRole.USER,
  ],
  [UserRole.SUPER_AGENT]: [UserRole.SUPER_AGENT, UserRole.USER],
  [UserRole.AGENT]:        [UserRole.AGENT,       UserRole.USER],
  [UserRole.SELLER]:       [UserRole.SELLER,      UserRole.USER],
  [UserRole.USER]:         [UserRole.USER],
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
    const user    = request.user;

    if (!user) throw new ForbiddenException('Not authenticated');

    const userRole      = user.role as string;
    const allowedRoles  = ROLE_HIERARCHY[userRole] || [userRole];
    const hasPermission = required.some(role => allowedRoles.includes(role));

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required: ${required.join(' or ')}. Your role: ${userRole}`
      );
    }

    return true;
  }
}