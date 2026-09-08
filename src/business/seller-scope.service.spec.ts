import { ForbiddenException } from '@nestjs/common';
import { SellerScopeService } from './seller-scope.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const payload = (rt: AccountRoleType) => ({ sub: 1, sid: 'session-1', rid: 10, rt, cv: 1 });
const userWithPayload = (id: number, rt?: AccountRoleType) => ({
  id,
  authPayload: rt ? payload(rt) : undefined,
}) as any;

describe('SellerScopeService', () => {
  const build = (resolvedRoleType?: AccountRoleType, membership: any = null) => {
    const teamRepo: any = { findOne: jest.fn().mockResolvedValue(membership) };
    const roleContextService: any = {
      resolveContext: jest.fn().mockResolvedValue(
        resolvedRoleType ? { roleType: resolvedRoleType, userId: 1, accountRoleId: 10 } : undefined,
      ),
    };
    return { service: new SellerScopeService(teamRepo, roleContextService), teamRepo, roleContextService };
  };

  it('grants own-business access when the active role is seller', async () => {
    const { service } = build(AccountRoleType.SELLER);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.SELLER))).resolves.toBe(1);
  });

  it('grants own-business access when the active role is admin (staff override)', async () => {
    const { service } = build(AccountRoleType.ADMIN);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.ADMIN))).resolves.toBe(1);
  });

  it('denies own-business access when the active role is buyer, even if the account also possesses a seller AccountRole', async () => {
    // Simulates an account that holds BOTH buyer and seller AccountRoles, but is
    // currently operating as buyer: resolveContext returns roleType=buyer here
    // regardless of the seller row's existence, so ownership must not be granted.
    const { service } = build(AccountRoleType.BUYER, null);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.BUYER)))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies own-business access when the active role is transport_provider', async () => {
    const { service } = build(AccountRoleType.TRANSPORT_PROVIDER, null);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.TRANSPORT_PROVIDER)))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never calls resolveContext or grants ownership when the JWT has no role-context claims (pre-migration token)', async () => {
    const { service, roleContextService, teamRepo } = build(undefined, null);
    await expect(service.resolve(userWithPayload(1))).rejects.toBeInstanceOf(ForbiddenException);
    expect(roleContextService.resolveContext).not.toHaveBeenCalled();
    expect(teamRepo.findOne).toHaveBeenCalled();
  });

  it('propagates a revoked/invalid session instead of silently falling back to team lookup', async () => {
    const teamRepo: any = { findOne: jest.fn() };
    const roleContextService: any = {
      resolveContext: jest.fn().mockRejectedValue({ response: { code: 'ROLE_CONTEXT_REVOKED' } }),
    };
    const service = new SellerScopeService(teamRepo, roleContextService);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.SELLER)))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
    expect(teamRepo.findOne).not.toHaveBeenCalled();
  });

  it('falls back to an active, permissioned BusinessTeamMember for a buyer-active staff member', async () => {
    const membership = { sellerId: 42, permissions: { canViewOrders: true } };
    const { service } = build(AccountRoleType.BUYER, membership);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.BUYER), 'canViewOrders')).resolves.toBe(42);
  });

  it('rejects a team member lacking the required permission', async () => {
    const membership = { sellerId: 42, permissions: { canViewOrders: true } };
    const { service } = build(AccountRoleType.BUYER, membership);
    await expect(service.resolve(userWithPayload(1, AccountRoleType.BUYER), 'canManageTeam'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('isAuthorizedFor', () => {
    it('is unaffected by role context and remains a pure ownership/team check', async () => {
      const { service } = build();
      await expect(service.isAuthorizedFor(userWithPayload(1), 1)).resolves.toBe(true);
    });
  });

  describe('resolveScope() — Business-First Stage 2A', () => {
    it('never changes resolve()\'s own return semantics — still a plain number, unaffected by resolveScope existing', async () => {
      const { service } = build(AccountRoleType.SELLER);
      const result = await service.resolve(userWithPayload(1, AccountRoleType.SELLER));
      expect(typeof result).toBe('number');
      expect(result).toBe(1);
    });

    it('VALID ORGANIZATIONAL SELLER: returns workspaceId from an already-resolved RoleContext, mode="workspace"', async () => {
      const { service } = build(AccountRoleType.SELLER);
      const roleContext = { roleType: AccountRoleType.SELLER, userId: 1, accountRoleId: 10, workspaceId: 2 } as any;
      const scope = await service.resolveScope(1, userWithPayload(1, AccountRoleType.SELLER), roleContext);
      expect(scope).toEqual({ legacySellerId: 1, workspaceId: 2, mode: 'workspace' });
    });

    it('does not re-resolve RoleContext when one is already supplied', async () => {
      const { service, roleContextService } = build(AccountRoleType.SELLER);
      const roleContext = { roleType: AccountRoleType.SELLER, userId: 1, accountRoleId: 10, workspaceId: 2 } as any;
      await service.resolveScope(1, userWithPayload(1, AccountRoleType.SELLER), roleContext);
      expect(roleContextService.resolveContext).not.toHaveBeenCalled();
    });

    it('VALID unresolved legacy Seller: a real RoleContext with workspaceId=null is legacy mode, not a failure', async () => {
      const { service } = build(AccountRoleType.SELLER);
      const roleContext = { roleType: AccountRoleType.SELLER, userId: 1, accountRoleId: 10, workspaceId: null } as any;
      const scope = await service.resolveScope(1, userWithPayload(1, AccountRoleType.SELLER), roleContext);
      expect(scope).toEqual({ legacySellerId: 1, workspaceId: null, mode: 'legacy' });
    });

    it('resolves fresh from the payload when no RoleContext is supplied, and still returns workspaceId from it', async () => {
      const teamRepo: any = { findOne: jest.fn() };
      const roleContextService: any = {
        resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.SELLER, userId: 1, accountRoleId: 10, workspaceId: 5 }),
      };
      const service = new SellerScopeService(teamRepo, roleContextService);
      const scope = await service.resolveScope(1, userWithPayload(1, AccountRoleType.SELLER));
      expect(scope).toEqual({ legacySellerId: 1, workspaceId: 5, mode: 'workspace' });
      expect(roleContextService.resolveContext).toHaveBeenCalledTimes(1);
    });

    it('CONTEXT-SAFETY: a missing sid/rid/cv (RoleContext could not be established) FAILS CLOSED — never silently treated as legacy mode', async () => {
      const teamRepo: any = { findOne: jest.fn() };
      const roleContextService: any = { resolveContext: jest.fn() };
      const service = new SellerScopeService(teamRepo, roleContextService);
      await expect(service.resolveScope(1, userWithPayload(1) /* no rt -> no sid/rid/cv */))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_MISSING' } });
      expect(roleContextService.resolveContext).not.toHaveBeenCalled();
    });

    it('CONTEXT-SAFETY: resolveContext() rejecting (revoked/expired/invalid) propagates as a failure, never degrades to legacy mode', async () => {
      const teamRepo: any = { findOne: jest.fn() };
      const roleContextService: any = {
        resolveContext: jest.fn().mockRejectedValue({ response: { code: 'ROLE_CONTEXT_REVOKED' } }),
      };
      const service = new SellerScopeService(teamRepo, roleContextService);
      await expect(service.resolveScope(1, userWithPayload(1, AccountRoleType.SELLER)))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
    });

    it('never derives workspaceId from legacySellerId — a mismatched legacySellerId does not change the resolved workspaceId', async () => {
      const { service } = build(AccountRoleType.SELLER);
      const roleContext = { roleType: AccountRoleType.SELLER, userId: 1, accountRoleId: 10, workspaceId: 2 } as any;
      // legacySellerId (999) is unrelated to workspaceId (2) -- proves workspaceId
      // is read purely from roleContext, never cross-checked/derived from it.
      const scope = await service.resolveScope(999, userWithPayload(1, AccountRoleType.SELLER), roleContext);
      expect(scope.workspaceId).toBe(2);
      expect(scope.legacySellerId).toBe(999);
    });
  });
});
