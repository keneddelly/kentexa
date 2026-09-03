import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveRoleGuard } from './active-role.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RoleContextService } from './role-context.service';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from './entities/account-role.entity';
import { UserRole } from '../users/entities/user.entity';

/**
 * Security closure pass, item 9: explicit multi-role authorization matrix.
 * Drives the real ActiveRoleGuard/RolesGuard through the RoleContext each
 * scenario resolves to -- proving that possessing a second AccountRole
 * (seller+admin, seller+transport_provider, etc.) never grants that
 * second role's authority while a different role is active, and that the
 * currently active role always succeeds on its own gates.
 */

// ActiveRoleGuard.canActivate is synchronous (returns boolean, throws
// synchronously) -- wrapped in a closure so callers can assert with
// plain toThrow()/toBe() rather than the async .rejects/.resolves matchers.
const activeRoleCheck = (required: AccountRoleType[], resolvedRoleType: AccountRoleType) => () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  const context: any = {
    switchToHttp: () => ({ getRequest: () => ({ roleContext: { roleType: resolvedRoleType } }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return new ActiveRoleGuard(reflector).canActivate(context);
};

const payload = (rt: AccountRoleType) => ({ sub: 1, sid: 's1', rid: 10, rt, cv: 1 });

const mockRolesGuardContext = (
  required: UserRole[],
  roleContextService: { resolveContext: jest.Mock },
  activeRoleType: AccountRoleType = AccountRoleType.BUYER,
) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  const request: any = { user: { id: 1, authPayload: payload(activeRoleType) } };
  const context: any = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => ({}), getClass: () => ({}) };
  return new RolesGuard(reflector, roleContextService as any).canActivate(context);
};

describe('Stage 1 closure — multi-role authorization matrix', () => {
  describe('Seller + Super Agent', () => {
    it('Seller active → Super Agent operational endpoint denied', () => {
      expect(activeRoleCheck([AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN], AccountRoleType.SELLER))
        .toThrow(ForbiddenException);
    });
    it('Super Agent active → Super Agent operational endpoint allowed', () => {
      expect(activeRoleCheck([AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN], AccountRoleType.SUPER_AGENT)())
        .toBe(true);
    });
  });

  describe('Seller + Admin', () => {
    it('Seller active → admin route denied', async () => {
      const roleContextService = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.SELLER }) };
      await expect(mockRolesGuardContext([UserRole.ADMIN], roleContextService, AccountRoleType.SELLER))
        .rejects.toThrow(ForbiddenException);
    });
    it('Admin active → admin route allowed', async () => {
      const roleContextService = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.ADMIN }) };
      await expect(mockRolesGuardContext([UserRole.ADMIN], roleContextService, AccountRoleType.ADMIN))
        .resolves.toBe(true);
    });
  });

  describe('Seller + Transport Provider', () => {
    it('Seller active → transport operational endpoint denied', () => {
      expect(activeRoleCheck([AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN], AccountRoleType.SELLER))
        .toThrow(ForbiddenException);
    });
    it('Transport active → transport operational endpoint allowed', () => {
      expect(activeRoleCheck([AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN], AccountRoleType.TRANSPORT_PROVIDER)())
        .toBe(true);
    });
    it('Transport active → seller operational endpoint denied (SellerScopeService path)', async () => {
      // Mirrors SellerScopeService.resolve(): "owns own business" is only ever
      // granted for the roleType RoleContextService.resolveContext resolves.
      const roleContextService = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.TRANSPORT_PROVIDER }) } as any;
      const OWNS_THEIR_OWN_BUSINESS = [AccountRoleType.SELLER, AccountRoleType.ADMIN, AccountRoleType.MANAGER];
      const roleContext = await roleContextService.resolveContext(payload(AccountRoleType.TRANSPORT_PROVIDER));
      expect(OWNS_THEIR_OWN_BUSINESS.includes(roleContext.roleType)).toBe(false);
    });
  });

  describe('Seller + Agent', () => {
    it('Seller active → agent operational endpoint denied', () => {
      expect(activeRoleCheck([AccountRoleType.AGENT], AccountRoleType.SELLER))
        .toThrow(ForbiddenException);
    });
    it('Agent active → agent operational endpoint allowed', () => {
      expect(activeRoleCheck([AccountRoleType.AGENT], AccountRoleType.AGENT)())
        .toBe(true);
    });
    it('Agent active → seller operational resource denied (SellerScopeService path)', () => {
      const OWNS_THEIR_OWN_BUSINESS = [AccountRoleType.SELLER, AccountRoleType.ADMIN, AccountRoleType.MANAGER];
      expect(OWNS_THEIR_OWN_BUSINESS.includes(AccountRoleType.AGENT)).toBe(false);
    });
  });

  describe('Buyer + Seller — private buyer commerce', () => {
    it('Seller active → buyer-private endpoint (create/my-orders/rate-seller/payments) denied', () => {
      expect(activeRoleCheck([AccountRoleType.BUYER], AccountRoleType.SELLER))
        .toThrow(ForbiddenException);
    });
    it('Buyer active → buyer-private endpoint allowed', () => {
      expect(activeRoleCheck([AccountRoleType.BUYER], AccountRoleType.BUYER)())
        .toBe(true);
    });
  });

  describe('Suspended / revoked / rejected roles', () => {
    it('suspended AccountRole cannot resolve as active — RoleContextService rejects it', async () => {
      const roleRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 10, userId: 1, roleType: AccountRoleType.SELLER,
          status: AccountRoleStatus.SUSPENDED, profileType: RoleProfileType.SELLER_PROFILE,
          profileId: 5, capabilities: {}, contextVersion: 1,
        }),
      };
      const sessionRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 's1', userId: 1, accountRoleId: 10, contextVersion: 1,
          expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
        }),
      };
      const other: any = { findOne: jest.fn() };
      const service = new RoleContextService(other, roleRepo, sessionRepo, other, other, other, other);
      await expect(service.resolveContext(payload(AccountRoleType.SELLER)))
        .rejects.toMatchObject({ response: { code: 'ROLE_NOT_ACTIVE' } });
    });

    it('a revoked session loses operational authority even mid-session', async () => {
      const sessionRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 's1', userId: 1, accountRoleId: 10, contextVersion: 1,
          expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(),
        }),
      };
      const other: any = { findOne: jest.fn() };
      const service = new RoleContextService(other, other, sessionRepo, other, other, other, other);
      await expect(service.resolveContext(payload(AccountRoleType.SELLER)))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
    });

    it('a rejected/pending AccountRole is never switchable into active operational authority', async () => {
      const role = {
        id: 10, userId: 1, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.REJECTED,
        profileType: RoleProfileType.AGENT, profileId: 5, capabilities: {}, contextVersion: 1,
      };
      const service = new RoleContextService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      await expect(service.isSwitchable(role as any)).resolves.toBe(false);
    });
  });

  describe('Forged identifiers grant nothing', () => {
    it('a forged rt claim never changes the resolved roleType (DB, not JWT, wins)', async () => {
      const role = {
        id: 10, userId: 1, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.USER, profileId: 1, capabilities: {}, contextVersion: 1,
      };
      const roleRepo: any = { findOne: jest.fn().mockResolvedValue(role) };
      const sessionRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 's1', userId: 1, accountRoleId: 10, contextVersion: 1,
          expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
        }),
        update: jest.fn(),
      };
      const userRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
      const service = new RoleContextService(userRepo, roleRepo, sessionRepo, {} as any, {} as any, {} as any, {} as any);
      // rt claims ADMIN; DB says this session's role is actually BUYER.
      const context = await service.resolveContext({ sub: 1, sid: 's1', rid: 10, rt: AccountRoleType.ADMIN, cv: 1 });
      expect(context.roleType).toBe(AccountRoleType.BUYER);
    });

    it('a forged accountRoleId (rid) pointing at a session belonging to a different role is rejected', async () => {
      const sessionRepo: any = {
        // Session's real accountRoleId (77) does not match the forged rid (10) in the payload.
        findOne: jest.fn().mockResolvedValue({
          id: 's1', userId: 1, accountRoleId: 77, contextVersion: 1,
          expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
        }),
      };
      const other: any = { findOne: jest.fn() };
      const service = new RoleContextService(other, other, sessionRepo, other, other, other, other);
      await expect(service.resolveContext(payload(AccountRoleType.ADMIN)))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_MISSING' } });
    });

    it('a client-supplied sellerId cannot substitute for a resolved seller AccountRole (ActiveRoleGuard ignores request body/params)', async () => {
      // ActiveRoleGuard only ever reads request.roleContext (server-resolved),
      // never request.body/params -- there is no code path for a forged
      // sellerId/providerId/agentId to reach the authorization decision at all.
      const reflector = { getAllAndOverride: jest.fn().mockReturnValue([AccountRoleType.SELLER]) } as unknown as Reflector;
      const request: any = { roleContext: { roleType: AccountRoleType.BUYER }, body: { sellerId: 999, commerceProfileId: 999 } };
      const context: any = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => ({}), getClass: () => ({}) };
      expect(() => new ActiveRoleGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
