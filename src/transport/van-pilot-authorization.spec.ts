import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { UserRole } from '../users/entities/user.entity';
import { VanPilotController } from './van-pilot.controller';

/**
 * Stage 3S-C8 review correction: proves, against the REAL ActiveRoleGuard
 * and the REAL @RequireActiveRole metadata on VanPilotController, that
 * provider-owned operational routes no longer advertise an ADMIN authority
 * the service layer can't actually honor (TransportService.getMyProfile/
 * assertSuperAgentAuthority both resolve ownership from the CALLER'S OWN
 * userId -- there is no admin-on-behalf-of-provider path anywhere in this
 * codebase, so admitting ADMIN there was a real contract bug, not a
 * convenience).
 *
 * No real Postgres/NestJS DI container needed -- ActiveRoleGuard only
 * depends on a Reflector (reads decorator metadata) and a plain
 * `{ roleContext }` on the fake request; this is a direct, deterministic
 * proof of the guard's actual runtime decision for each real controller
 * method, not a paraphrase of the decorator array.
 */
describe('Stage 3S-C8 — VanPilotController authorization correction', () => {
  const guard = new ActiveRoleGuard(new Reflector());

  const fakeContext = (handler: Function, roleType: AccountRoleType | undefined): ExecutionContext => ({
    getHandler: () => handler,
    getClass: () => VanPilotController,
    switchToHttp: () => ({
      getRequest: () => (roleType ? { roleContext: { roleType } } : {}),
    }),
  }) as unknown as ExecutionContext;

  const canActivateAs = (handler: Function, roleType: AccountRoleType) => guard.canActivate(fakeContext(handler, roleType));

  // Representative provider-owned write/read routes -- one from each group
  // the review named explicitly (route stops, runs, vehicles, assignments).
  const providerOwnedRoutes: Array<[string, Function]> = [
    ['addRouteStop', VanPilotController.prototype.addRouteStop],
    ['reorderRouteStop', VanPilotController.prototype.reorderRouteStop],
    ['createRun', VanPilotController.prototype.createRun],
    ['listMyRuns', VanPilotController.prototype.listMyRuns],
    ['addVehicle', VanPilotController.prototype.addVehicle],
    ['assignVehicleToRun', VanPilotController.prototype.assignVehicleToRun],
    ['createAssignment', VanPilotController.prototype.createAssignment],
    ['markLoaded', VanPilotController.prototype.markLoaded],
    ['markUnloaded', VanPilotController.prototype.markUnloaded],
    ['cancelAssignment', VanPilotController.prototype.cancelAssignment],
  ];

  describe('(1) TRANSPORT_PROVIDER can reach every provider-owned operational route', () => {
    it.each(providerOwnedRoutes)('%s admits TRANSPORT_PROVIDER', (_name, handler) => {
      expect(canActivateAs(handler, AccountRoleType.TRANSPORT_PROVIDER)).toBe(true);
    });
  });

  describe('(2) ADMIN can no longer enter provider-owned write/read routes (no admin-on-behalf-of-provider path exists)', () => {
    it.each(providerOwnedRoutes)('%s rejects ADMIN', (_name, handler) => {
      expect(() => canActivateAs(handler, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
    });
  });

  describe('(3) SUPER_AGENT cannot enter provider-owned write routes', () => {
    it.each(providerOwnedRoutes)('%s rejects SUPER_AGENT', (_name, handler) => {
      expect(() => canActivateAs(handler, AccountRoleType.SUPER_AGENT)).toThrow(ForbiddenException);
    });
  });

  describe('(5) confirm-receipt remains SUPER_AGENT-only', () => {
    const handler = VanPilotController.prototype.confirmReceipt;
    it('admits SUPER_AGENT', () => {
      expect(canActivateAs(handler, AccountRoleType.SUPER_AGENT)).toBe(true);
    });
    it('rejects ADMIN -- no admin-on-behalf-of-Super-Agent path exists (assertSuperAgentAuthority resolves ownership from the caller\'s own userId)', () => {
      expect(() => canActivateAs(handler, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
    });
    it('rejects TRANSPORT_PROVIDER', () => {
      expect(() => canActivateAs(handler, AccountRoleType.TRANSPORT_PROVIDER)).toThrow(ForbiddenException);
    });
  });

  describe('(4) dedicated /admin/* visibility endpoints remain admin-only', () => {
    const reflector = new Reflector();
    const adminHandlers: Array<[string, Function]> = [
      ['adminListRuns', VanPilotController.prototype.adminListRuns],
      ['adminGetRunDetail', VanPilotController.prototype.adminGetRunDetail],
      ['adminBlockedParcels', VanPilotController.prototype.adminBlockedParcels],
      ['adminAwaitingCompletion', VanPilotController.prototype.adminAwaitingCompletion],
    ];
    it.each(adminHandlers)('%s is decorated with exactly @Roles(ADMIN)', (_name, handler) => {
      // These routes go through the OLDER RolesGuard (@Roles, metadata key
      // 'roles'), which itself resolves the caller's live active role via
      // RoleContextService against the real database -- out of scope for a
      // DB-free unit test. The metadata itself is the actual, unambiguous
      // authorization contract these routes advertise; asserting it directly
      // is the correct-sized proof here, matching the admin pattern this
      // codebase already uses everywhere else (admin-intelligence.controller.ts).
      expect(reflector.get<UserRole[]>('roles', handler)).toEqual([UserRole.ADMIN]);
    });
  });

  // Readiness hardening: shared Run reads are admitted only for provider or
  // Super Agent active roles; service-level ownership/itinerary scoping then
  // decides which exact Run is visible. Admin uses dedicated /admin routes.
  describe('shared Run reads expose only operational roles with scoped visibility', () => {
    for (const roleType of [AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT]) {
      it(`getRunStops admits ${roleType}`, () => {
        expect(canActivateAs(VanPilotController.prototype.getRunStops, roleType)).toBe(true);
      });
      it(`getRunAssignments admits ${roleType}`, () => {
        expect(canActivateAs(VanPilotController.prototype.getRunAssignments, roleType)).toBe(true);
      });
    }
    it('getRunStops rejects ADMIN (dedicated admin read-model exists)', () => {
      expect(() => canActivateAs(VanPilotController.prototype.getRunStops, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
    });
    it('getRunAssignments rejects ADMIN (dedicated admin read-model exists)', () => {
      expect(() => canActivateAs(VanPilotController.prototype.getRunAssignments, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
    });
  });

  describe('readiness-only operational routes', () => {
    it('cancelRun is TRANSPORT_PROVIDER-only', () => {
      expect(canActivateAs(VanPilotController.prototype.cancelRun, AccountRoleType.TRANSPORT_PROVIDER)).toBe(true);
      expect(() => canActivateAs(VanPilotController.prototype.cancelRun, AccountRoleType.SUPER_AGENT)).toThrow(ForbiddenException);
      expect(() => canActivateAs(VanPilotController.prototype.cancelRun, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
    });
    it('movement tender issuance is SUPER_AGENT-only', () => {
      const handler = VanPilotController.prototype.tenderParcelToProvider;
      expect(canActivateAs(handler, AccountRoleType.SUPER_AGENT)).toBe(true);
      expect(() => canActivateAs(handler, AccountRoleType.TRANSPORT_PROVIDER)).toThrow(ForbiddenException);
      expect(() => canActivateAs(handler, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
      expect(() => canActivateAs(handler, AccountRoleType.AGENT)).toThrow(ForbiddenException);
    });
    it('desk queues are SUPER_AGENT-only', () => {
      for (const handler of [
        VanPilotController.prototype.listMyDeskBlockedReceipts,
        VanPilotController.prototype.listMyDeskAwaitingCompletion,
      ]) {
        expect(canActivateAs(handler, AccountRoleType.SUPER_AGENT)).toBe(true);
        expect(() => canActivateAs(handler, AccountRoleType.TRANSPORT_PROVIDER)).toThrow(ForbiddenException);
        expect(() => canActivateAs(handler, AccountRoleType.ADMIN)).toThrow(ForbiddenException);
      }
    });
  });
});
