import { SetMetadata } from '@nestjs/common';
import { AccountRoleType } from './entities/account-role.entity';

export const REQUIRED_ACTIVE_ROLES = 'required_active_roles';

/**
 * Gates a route to the CURRENT active role context, not mere possession of a
 * role. Requires RoleContextGuard to run first so request.roleContext is set.
 */
export const RequireActiveRole = (...roles: AccountRoleType[]) =>
  SetMetadata(REQUIRED_ACTIVE_ROLES, roles);
