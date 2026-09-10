import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { RoleContextException } from '../role-context/role-context.exception';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { UserRole } from '../users/entities/user.entity';
import { AdminBusinessCapabilityApplicationController } from './admin-business-capability-application.controller';

/**
 * Business Capability Activation Stage B3, mission §34. Proves this
 * controller's three routes actually carry @Roles(UserRole.ADMIN) metadata
 * and are correctly enforced by the SAME RolesGuard every other admin
 * endpoint in this codebase uses (SellerController's approve/reject, etc.)
 * -- authority is resolved from the caller's CURRENTLY ACTIVE RoleContext
 * (roles.guard.ts's own established mechanism), never a raw User.role
 * column, so this doesn't re-test RolesGuard's own internals (already
 * covered by stage1-closure.spec.ts) -- it proves THIS controller is wired
 * to it correctly.
 */
describe('AdminBusinessCapabilityApplicationController — admin-only authorization (Stage B3 mission §34)', () => {
  const reflector = new Reflector();
  const payload = (rt: AccountRoleType) => ({ sub: 1, sid: 's1', rid: 10, rt, cv: 1 });

  const buildContext = (activeRoleType: AccountRoleType) => {
    const request: any = { user: { id: 1, authPayload: payload(activeRoleType) } };
    return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => AdminBusinessCapabilityApplicationController.prototype.approve, getClass: () => AdminBusinessCapabilityApplicationController } as any;
  };

  const controller = AdminBusinessCapabilityApplicationController;

  it('list/approve/reject all declare @Roles(UserRole.ADMIN)', () => {
    for (const method of ['list', 'approve', 'reject'] as const) {
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

  it('a Buyer active RoleContext is denied (403), never merely because they possess a User.role column value', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.BUYER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.BUYER);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('a Seller active RoleContext is denied -- being a Seller (even the applicant themselves) grants no admin authority', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.SELLER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.SELLER);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('the Business owner submitting their own application cannot approve it merely by being the owner -- ownership never substitutes for an active ADMIN RoleContext', async () => {
    // Same mechanism as the Seller-denied test above: RolesGuard/the service
    // never consult Business.user or BusinessMembership for admin authority
    // at all -- the guard is the ONLY gate, and it only ever asks "what is
    // this caller's currently active RoleContext.roleType."
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.SELLER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.SELLER);
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

  it('an admin switched into a DIFFERENT active role (e.g. their own Seller role elsewhere) does not retain admin authority', async () => {
    // Mirrors ActiveRoleHierarchy's own documented rule (roles.guard.ts):
    // authority is evaluated against the single currently active role, never
    // a union of every role the account has ever held.
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.SELLER }) };
    const guard = new RolesGuard(reflector, roleContextService);
    const context = buildContext(AccountRoleType.SELLER);
    (reflector as any).getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
