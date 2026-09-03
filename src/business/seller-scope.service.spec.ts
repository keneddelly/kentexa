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
});
