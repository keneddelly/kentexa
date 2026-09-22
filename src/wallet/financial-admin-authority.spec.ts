import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { REQUIRED_ACTIVE_ROLES } from '../role-context/require-active-role.decorator';
import { RoleContextException } from '../role-context/role-context.exception';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { MoneyRoutingAdminController } from '../money-routing/money-routing.controller';
import { AdminPayoutDestinationController } from './payout-destination.controller';
import { AdminWalletController, WalletController } from './wallet.controller';
import { NoTeamMembershipException, SellerScopeService } from '../business/seller-scope.service';

/**
 * Financial administration authority (I2G correction). The three admin controllers that move or
 * unlock money -- money-routing resolve, payout-destination verify, withdrawal approve/reject --
 * must all use ONE canonical mechanism: JwtAuthGuard + RoleContextGuard + ActiveRoleGuard requiring
 * the exact ACTIVE AccountRoleType.ADMIN. The legacy account-level User.role is never authority.
 * (The repository's capability registry is empty -- no `financial.manage` -- so the exact active
 * admin role is the mechanism; no capability system is invented here.)
 */

type Case = { name: string; controller: any; call: (c: any, ctx: any) => any; service: jest.Mock; build: (svc: jest.Mock) => any };

const buildCases = (): Case[] => {
  const mk = (): { svc: jest.Mock } => ({ svc: jest.fn().mockResolvedValue({ ok: true }) });
  const cases: Case[] = [];

  let a = mk();
  cases.push({
    name: 'money-routing resolve', controller: MoneyRoutingAdminController, service: a.svc,
    build: (svc) => new MoneyRoutingAdminController({ resolveBlocked: svc, routeEntry: svc, listBlocked: svc } as any),
    call: (c, ctx) => c.resolve(ctx, 7, 'evidence'),
  });
  a = mk();
  cases.push({
    name: 'money-routing blocked list', controller: MoneyRoutingAdminController, service: a.svc,
    build: (svc) => new MoneyRoutingAdminController({ resolveBlocked: svc, routeEntry: svc, listBlocked: svc } as any),
    call: (c) => c.blocked(),
  });
  a = mk();
  cases.push({
    name: 'payout-destination verify', controller: AdminPayoutDestinationController, service: a.svc,
    build: (svc) => new AdminPayoutDestinationController({ verify: svc } as any),
    call: (c, ctx) => c.verify(ctx, 3, {}),
  });
  a = mk();
  cases.push({
    name: 'withdrawal approve', controller: AdminWalletController, service: a.svc,
    build: (svc) => new AdminWalletController({ approveWithdrawal: svc, rejectWithdrawal: svc, listPendingWithdrawals: svc } as any),
    call: (c) => c.approve(9),
  });
  a = mk();
  cases.push({
    name: 'withdrawal reject', controller: AdminWalletController, service: a.svc,
    build: (svc) => new AdminWalletController({ approveWithdrawal: svc, rejectWithdrawal: svc, listPendingWithdrawals: svc } as any),
    call: (c) => c.reject(9, 'no'),
  });
  a = mk();
  cases.push({
    name: 'withdrawal list', controller: AdminWalletController, service: a.svc,
    build: (svc) => new AdminWalletController({ approveWithdrawal: svc, rejectWithdrawal: svc, listPendingWithdrawals: svc } as any),
    call: (c) => c.list(),
  });
  return cases;
};

/** Runs the controller's REAL class-level guards (in declaration order) against a stubbed RoleContextService. */
const runGuards = async (controller: any, req: any, resolveContext: jest.Mock) => {
  const reflector = new Reflector();
  const classes: any[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  const http: any = { getRequest: () => req };
  const ctx = { switchToHttp: () => http, getHandler: () => function handler() {}, getClass: () => controller } as unknown as ExecutionContext;
  for (const Guard of classes) {
    let guard: any;
    if (Guard === RoleContextGuard) guard = new RoleContextGuard({ resolveContext } as any);
    else if (Guard === ActiveRoleGuard) guard = new ActiveRoleGuard(reflector);
    else if (Guard === JwtAuthGuard) continue; // authentication itself is covered elsewhere; req.user is set below
    else if (Guard === RolesGuard) guard = new RolesGuard(reflector, { resolveContext } as any);
    else throw new Error(`unexpected guard ${Guard?.name}`);
    await guard.canActivate(ctx);
  }
};

const request = (legacyUserRole: string) => ({
  user: { id: 5, role: legacyUserRole, authPayload: { sub: 5, sid: 's', rid: 1, cv: 1 } },
});
const ctxFor = (roleType: AccountRoleType, extra: Record<string, unknown> = {}) => ({
  roleType, userId: 5, identityType: roleType === AccountRoleType.ADMIN ? 'PERSONAL' : 'PERSONAL', workspaceId: null, ...extra,
});

describe('financial admin authority — one canonical mechanism for every financial-admin endpoint group', () => {
  it('all three controllers use exactly JwtAuthGuard + RoleContextGuard + ActiveRoleGuard, require the ACTIVE admin role, and none uses RolesGuard/@Roles', () => {
    for (const controller of [MoneyRoutingAdminController, AdminPayoutDestinationController, AdminWalletController]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([JwtAuthGuard, RoleContextGuard, ActiveRoleGuard]);
      expect(Reflect.getMetadata(REQUIRED_ACTIVE_ROLES, controller)).toEqual([AccountRoleType.ADMIN]);
      expect(Reflect.getMetadata('roles', controller)).toBeUndefined(); // no legacy @Roles(UserRole.*)
    }
  });

  describe.each(buildCases())('$name', (c) => {
    const attempt = async (roleContext: any | Error, legacyUserRole: string) => {
      const svc = jest.fn().mockResolvedValue({ ok: true });
      const instance = c.build(svc);
      const resolveContext = jest.fn(async () => { if (roleContext instanceof Error) throw roleContext; return roleContext; });
      const req: any = request(legacyUserRole);
      await runGuards(c.controller, req, resolveContext);
      await c.call(instance, req.roleContext);
      return { svc, resolveContext };
    };

    it('1. legacy User.role=ADMIN but the ACTIVE role context is not admin -> DENIED; the financial service is never called', async () => {
      for (const role of [AccountRoleType.SELLER, AccountRoleType.BUYER, AccountRoleType.MANAGER, AccountRoleType.SUPER_AGENT, AccountRoleType.CUSTOMER_CARE]) {
        const svc = jest.fn();
        const instance = c.build(svc);
        const req: any = request('admin');
        await expect(runGuards(c.controller, req, jest.fn().mockResolvedValue(ctxFor(role)))).rejects.toBeInstanceOf(ForbiddenException);
        expect(svc).not.toHaveBeenCalled();
        void instance;
      }
      // a Business identity acting as Seller is denied as well
      const svc = jest.fn();
      c.build(svc);
      await expect(runGuards(c.controller, request('admin'), jest.fn().mockResolvedValue(ctxFor(AccountRoleType.SELLER, { identityType: 'BUSINESS', workspaceId: 4, businessId: 4 })))).rejects.toMatchObject({ response: { code: 'ACTIVE_ROLE_REQUIRED' } });
      expect(svc).not.toHaveBeenCalled();
    });

    it('2. revoked / suspended / expired / invalid admin context -> DENIED by RoleContext validation; the service is never called', async () => {
      for (const code of ['ROLE_CONTEXT_REVOKED', 'ROLE_NOT_ACTIVE', 'ROLE_CONTEXT_EXPIRED', 'ROLE_CONTEXT_VERSION_MISMATCH', 'ROLE_PROFILE_INVALID', 'ROLE_CONTEXT_MISSING'] as const) {
        const svc = jest.fn();
        c.build(svc);
        await expect(runGuards(c.controller, request('admin'), jest.fn().mockRejectedValue(new RoleContextException(code)))).rejects.toBeInstanceOf(RoleContextException);
        expect(svc).not.toHaveBeenCalled();
      }
      // a request with no session claims at all fails before any context can exist
      const svc = jest.fn();
      c.build(svc);
      await expect(runGuards(c.controller, { user: { id: 5, role: 'admin' } }, jest.fn())).rejects.toBeInstanceOf(RoleContextException);
      expect(svc).not.toHaveBeenCalled();
    });

    it('3. exact valid ACTIVE admin role context -> ALLOWED (legacy User.role is irrelevant either way)', async () => {
      for (const legacy of ['admin', 'user', 'seller']) {
        const { svc, resolveContext } = await attempt(ctxFor(AccountRoleType.ADMIN), legacy);
        expect(resolveContext).toHaveBeenCalled();
        expect(svc).toHaveBeenCalled();
      }
    });
  });

  it('the acting financial identity is the validated RoleContext user, not a request-level user field', async () => {
    const resolveBlocked = jest.fn().mockResolvedValue(undefined);
    const routeEntry = jest.fn().mockResolvedValue({ state: 'ROUTED' });
    const routing = new MoneyRoutingAdminController({ resolveBlocked, routeEntry } as any);
    await routing.resolve({ roleType: 'admin', userId: 42 } as any, 7, 'evidence');
    expect(resolveBlocked).toHaveBeenCalledWith(7, 42, 'evidence');
    const verify = jest.fn().mockResolvedValue({});
    await new AdminPayoutDestinationController({ verify } as any).verify({ roleType: 'admin', userId: 42 } as any, 3, { verificationRef: 'K' });
    expect(verify).toHaveBeenCalledWith(42, 3, { verificationRef: 'K' });
  });
});

describe('WalletController Personal-wallet fallback — uncertain authority fails closed', () => {
  const personalCtx: any = { identityType: 'PERSONAL', workspaceId: null, userId: 5 };
  const build = (resolve: jest.Mock) => {
    const walletService: any = {
      getWalletForContext: jest.fn().mockResolvedValue({ wallet: {}, transactions: [] }),
      requestPersonalWithdrawal: jest.fn().mockResolvedValue({}),
      requestBusinessWithdrawal: jest.fn(),
    };
    return { controller: new WalletController(walletService, { resolve } as any), walletService };
  };

  it('ONLY NoTeamMembershipException selects the caller\'s own Personal wallet (read and withdraw)', async () => {
    const { controller, walletService } = build(jest.fn().mockRejectedValue(new NoTeamMembershipException('You are not authorized to manage this business.')));
    await controller.getWallet({ user: { id: 5 } }, personalCtx);
    expect(walletService.getWalletForContext).toHaveBeenCalledWith({ identityType: 'PERSONAL', workspaceId: null, userId: 5 });
    await controller.withdraw({ user: { id: 5 } }, personalCtx, 10 as any);
    expect(walletService.requestPersonalWithdrawal).toHaveBeenCalledWith(5, 10);
  });

  it.each([
    ['revoked session', new RoleContextException('ROLE_CONTEXT_REVOKED')],
    ['a team member lacking the permission (plain Forbidden)', new ForbiddenException({ code: 'SELLER_SCOPE_PERMISSION_DENIED', message: 'x' })],
    ['a workspace/scope mismatch', new ForbiddenException({ code: 'BUSINESS_SCOPE_MISMATCH', message: 'BUSINESS_SCOPE_MISMATCH' })],
    ['a generic Forbidden (unknown authorization error)', new ForbiddenException('nope')],
    ['a bad request', new BadRequestException('bad')],
    ['a database error', Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' })],
    ['an internal error', new InternalServerErrorException('boom')],
    ['a non-Error rejection', 'weird' as any],
  ])('propagates %s and never selects a wallet', async (_label, error) => {
    const { controller, walletService } = build(jest.fn().mockRejectedValue(error));
    await expect(controller.getWallet({ user: { id: 5 } }, personalCtx)).rejects.toBe(error);
    await expect(controller.withdraw({ user: { id: 5 } }, personalCtx, 10 as any)).rejects.toBe(error);
    expect(walletService.getWalletForContext).not.toHaveBeenCalled();
    expect(walletService.requestPersonalWithdrawal).not.toHaveBeenCalled();
  });

  it('a delegated team member resolves to the employer\'s wallet id (unchanged compatibility)', async () => {
    const { controller, walletService } = build(jest.fn().mockResolvedValue(99));
    await controller.getWallet({ user: { id: 5 } }, personalCtx);
    expect(walletService.getWalletForContext).toHaveBeenCalledWith({ identityType: 'PERSONAL', workspaceId: null, userId: 99 });
  });

  it('SellerScopeService distinguishes "no membership" (fallback-eligible) from "member without the permission" (not)', async () => {
    const roleContextService: any = { resolveContext: jest.fn().mockResolvedValue({ roleType: AccountRoleType.BUYER, userId: 5 }) };
    const user: any = { id: 5, authPayload: { sub: 5, sid: 's', rid: 1, cv: 1 } };
    const noMembership = new SellerScopeService({ findOne: jest.fn().mockResolvedValue(null) } as any, roleContextService);
    await expect(noMembership.resolve(user, 'canViewRevenue')).rejects.toBeInstanceOf(NoTeamMembershipException);
    const lacksPermission = new SellerScopeService({ findOne: jest.fn().mockResolvedValue({ sellerId: 99, permissions: { canViewOrders: true } }) } as any, roleContextService);
    const err: any = await lacksPermission.resolve(user, 'canViewRevenue').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err).not.toBeInstanceOf(NoTeamMembershipException);
    expect(err.response.code).toBe('SELLER_SCOPE_PERMISSION_DENIED');
    const member = new SellerScopeService({ findOne: jest.fn().mockResolvedValue({ sellerId: 99, permissions: { canViewRevenue: true } }) } as any, roleContextService);
    await expect(member.resolve(user, 'canViewRevenue')).resolves.toBe(99);
  });
});
