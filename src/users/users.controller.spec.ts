import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    usersService = {
      findOne: jest.fn().mockResolvedValue({ id: 2, name: 'Someone' }),
      update: jest.fn().mockResolvedValue({ id: 2, name: 'Updated' }),
    };
    controller = new UsersController(usersService as any);
  });

  const roleContext = (roleType: AccountRoleType) => ({ roleType }) as any;

  // Regression: GET /users/:id had no ownership check at all — any logged-in
  // user could read any other user's full record by ID. Now resolved from
  // the caller's CURRENT active RoleContext (security closure pass), not
  // the legacy user.role field — an admin currently operating as a
  // different role no longer trips the admin bypass.
  describe('findOne() IDOR guard', () => {
    it('denies a non-owner, non-admin requester', () => {
      const req = { user: { id: 1 } };
      expect(() =>
        controller.findOne(2, req as any, roleContext(AccountRoleType.BUYER)),
      ).toThrow(ForbiddenException);
    });

    it('allows the owner to read their own record', async () => {
      const req = { user: { id: 2 } };
      await expect(
        controller.findOne(2, req as any, roleContext(AccountRoleType.BUYER)),
      ).resolves.toEqual({ id: 2, name: 'Someone' });
    });

    it('allows an admin ACTIVE as admin to read any record', async () => {
      const req = { user: { id: 1 } };
      await expect(
        controller.findOne(2, req as any, roleContext(AccountRoleType.ADMIN)),
      ).resolves.toEqual({ id: 2, name: 'Someone' });
    });

    it('denies an admin who is currently active as a different role', () => {
      // Regression for the closure-pass fix itself: possessing admin (a
      // stale user.role value) must not bypass this check while the
      // account is actively operating as e.g. seller.
      const req = { user: { id: 1 } };
      expect(() =>
        controller.findOne(2, req as any, roleContext(AccountRoleType.SELLER)),
      ).toThrow(ForbiddenException);
    });
  });

  describe('update() ownership + role-escalation guard', () => {
    it('denies a non-owner, non-admin requester', () => {
      const req = { user: { id: 1 } };
      expect(() =>
        controller.update(2, { name: 'x' } as any, req as any, roleContext(AccountRoleType.BUYER)),
      ).toThrow(ForbiddenException);
    });

    it('strips role from a non-admin updating their own profile', async () => {
      const req = { user: { id: 2 } };
      const dto = { name: 'x', role: 'admin' } as any;
      await controller.update(2, dto, req as any, roleContext(AccountRoleType.BUYER));
      expect(usersService.update).toHaveBeenCalledWith(
        2,
        expect.not.objectContaining({ role: 'admin' }),
      );
    });

    it('lets an admin ACTIVE as admin set role on another user', async () => {
      const req = { user: { id: 1 } };
      const dto = { role: 'manager' } as any;
      await controller.update(2, dto, req as any, roleContext(AccountRoleType.ADMIN));
      expect(usersService.update).toHaveBeenCalledWith(2, dto);
    });

    it('denies an admin who is currently active as a different role', () => {
      const req = { user: { id: 1 } };
      expect(() =>
        controller.update(2, { role: 'manager' } as any, req as any, roleContext(AccountRoleType.SELLER)),
      ).toThrow(ForbiddenException);
    });
  });
});
