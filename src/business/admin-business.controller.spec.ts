import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminBusinessController } from './admin-business.controller';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { REQUIRED_ACTIVE_ROLES } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { BusinessStatus } from './entities/business.entity';

describe('admin Business lifecycle', () => {
  it('requires a resolved active ADMIN session for the entire controller', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminBusinessController)).toEqual([
      JwtAuthGuard, RoleContextGuard, ActiveRoleGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRED_ACTIVE_ROLES, AdminBusinessController)).toEqual([AccountRoleType.ADMIN]);
  });

  it('rejects malformed search parameters before querying the database', async () => {
    const dataSource = { getRepository: jest.fn() };
    const controller = new AdminBusinessController(dataSource as any);
    await expect(controller.list({ nested: 'value' } as any)).rejects.toThrow('Invalid business search');
    await expect(controller.list('', ['active'] as any)).rejects.toThrow('Invalid business search');
    expect(dataSource.getRepository).not.toHaveBeenCalled();
  });

  it('restores once and writes the actor and status change in the same transaction', async () => {
    const business = { id: 4, status: BusinessStatus.SUSPENDED };
    const saveBusiness = jest.fn(async () => business);
    const saveAudit = jest.fn(async () => ({}));
    const findOne = jest.fn(async () => business);
    const manager = { getRepository: jest.fn((entity) => entity.name === 'Business'
      ? { findOne, save: saveBusiness }
      : { save: saveAudit }) };
    const dataSource = { transaction: jest.fn(async (fn) => fn(manager)) };
    const controller = new AdminBusinessController(dataSource as any);

    expect(await controller.restore(4, { user: { id: 7 } }, { reason: 'Appeal accepted' })).toEqual({ id: 4, status: BusinessStatus.ACTIVE, changed: true });
    expect(saveAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 7, action: 'business.restore', previousValue: { status: BusinessStatus.SUSPENDED }, newValue: { status: BusinessStatus.ACTIVE, reason: 'Appeal accepted' } }));
    expect(await controller.restore(4, { user: { id: 8 } }, { reason: 'Retry' })).toEqual({ id: 4, status: BusinessStatus.ACTIVE, changed: false });
    expect(saveAudit).toHaveBeenCalledTimes(1);
    expect(saveBusiness).toHaveBeenCalledTimes(1);
  });
});
