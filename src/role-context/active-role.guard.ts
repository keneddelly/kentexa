import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ACTIVE_ROLES } from './require-active-role.decorator';
import { RoleContextException } from './role-context.exception';
import { AccountRoleType } from './entities/account-role.entity';
import { RoleContext } from './role-context.types';

/**
 * Enforces that the CURRENT active role context (set by RoleContextGuard)
 * matches one of the roles a route requires. Possessing an AccountRole of the
 * required type is never sufficient on its own — only the role the caller is
 * currently operating as (resolved server-side from the session/JWT rid, see
 * RoleContextService.resolveContext) can satisfy this check.
 */
@Injectable()
export class ActiveRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccountRoleType[]>(REQUIRED_ACTIVE_ROLES, [
      context.getHandler(), context.getClass(),
    ]) || [];
    if (required.length === 0) return true;

    const roleContext = context.switchToHttp().getRequest().roleContext as RoleContext | undefined;
    if (!roleContext) throw new RoleContextException('ROLE_CONTEXT_MISSING');
    if (!required.includes(roleContext.roleType)) {
      throw new ForbiddenException({ code: 'ACTIVE_ROLE_REQUIRED', message: 'ACTIVE_ROLE_REQUIRED' });
    }
    return true;
  }
}
