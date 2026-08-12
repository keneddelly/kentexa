import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserRole } from './entities/user.entity';

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

  // Regression: GET /users/:id had no ownership check at all — any logged-in
  // user could read any other user's full record by ID.
  describe('findOne() IDOR guard', () => {
    it('denies a non-owner, non-admin requester', () => {
      const req = { user: { id: 1, role: UserRole.BUYER } };
      expect(() => controller.findOne(2, req as any)).toThrow(
        ForbiddenException,
      );
    });

    it('allows the owner to read their own record', async () => {
      const req = { user: { id: 2, role: UserRole.BUYER } };
      await expect(controller.findOne(2, req as any)).resolves.toEqual({
        id: 2,
        name: 'Someone',
      });
    });

    it('allows an admin to read any record', async () => {
      const req = { user: { id: 1, role: UserRole.ADMIN } };
      await expect(controller.findOne(2, req as any)).resolves.toEqual({
        id: 2,
        name: 'Someone',
      });
    });
  });

  describe('update() ownership + role-escalation guard', () => {
    it('denies a non-owner, non-admin requester', () => {
      const req = { user: { id: 1, role: UserRole.BUYER } };
      expect(() =>
        controller.update(2, { name: 'x' } as any, req as any),
      ).toThrow(ForbiddenException);
    });

    it('strips role from a non-admin updating their own profile', async () => {
      const req = { user: { id: 2, role: UserRole.BUYER } };
      const dto = { name: 'x', role: UserRole.ADMIN } as any;
      await controller.update(2, dto, req as any);
      expect(usersService.update).toHaveBeenCalledWith(
        2,
        expect.not.objectContaining({ role: UserRole.ADMIN }),
      );
    });

    it('lets an admin set role on another user', async () => {
      const req = { user: { id: 1, role: UserRole.ADMIN } };
      const dto = { role: UserRole.MANAGER } as any;
      await controller.update(2, dto, req as any);
      expect(usersService.update).toHaveBeenCalledWith(2, dto);
    });
  });
});
