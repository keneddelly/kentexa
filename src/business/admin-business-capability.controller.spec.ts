import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { RoleContextException } from '../role-context/role-context.exception';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { UserRole } from '../users/entities/user.entity';
import { AdminBusinessCapabilityController } from './admin-business-capability.controller';

/**
 * Business Capability Activation Stage B4, mission §18 (ADMIN AUTH). Proves
 * suspend/reactivate carry @Roles(UserRole.ADMIN) and are enforced by the
 * SAME RolesGuard every other admin endpoint in this codebase uses (B3's own
 * admin-business-capability-application.controller.spec.ts is the template
 * this mirrors) -- authority comes from the caller's CURRENTLY ACTIVE
 * RoleContext, never a raw User.role column. This does not re-test
 * RolesGuard's own internals, only that THIS controller is wired to it.
 */
describe('AdminBusinessCapabilityController — admin-only authorization (Stage B4 mission §18)', () => {
  const reflector = new Reflector();
  const payload = (rt: AccountRoleType) => ({ sub: 1, sid: 's1', rid: 10, rt, cv: 1 });

  const buildContext = (activeRoleType: AccountRoleType) => {
    const request: any = { user: { id: 1, authPayload: payload(activeRoleType) } };
    return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => AdminBusinessCapabilityController.prototype.suspend, getClass: () => AdminBusinessCapabilityController } as any;
  };

  const controller = AdminBusinessCapabilityController;

  it('suspend/reactivate both declare @Roles(UserRole.ADMIN)', () => {
    for (const method of ['suspend', 'reactivate'] as const) {
      const required = Reflect.getMetadata('roles', controller.prototype[method]);
      expect(required).toEqual([UserRole.ADMIN]);
    }
  });

  it('a valid ADMIN active RoleContext is allowed through', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.ADMIN }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.ADMIN);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('a non-admin (Seller) active RoleContext is denied — being a Seller (even the affected Business owner) grants no admin authority', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.SELLER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.SELLER);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('a Buyer active RoleContext is denied', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.BUYER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.BUYER);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('a revoked/superseded admin session is denied per existing RoleContext semantics, not silently downgraded', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockRejectedValue(new RoleContextException('ROLE_CONTEXT_REVOKED')) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.ADMIN);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
  });

  it('an admin switched into a DIFFERENT active role does not retain admin authority', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.TRANSPORT_PROVIDER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.TRANSPORT_PROVIDER);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
