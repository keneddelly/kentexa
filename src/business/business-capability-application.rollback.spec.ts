import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { Business } from './entities/business.entity';
import { BusinessCapability } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { AccountRole } from '../role-context/entities/account-role.entity';

/**
 * Business Capability Activation Stage B2, mission §31 items 23-25.
 * Mocked-transaction failure injection -- the real disposable-DB suite
 * (business-capability-application.service.spec.ts) already proves the
 * happy path and concurrency behavior against genuine Postgres; forcing a
 * failure at one SPECIFIC internal step (profile save / role save /
 * application save) independently of the others is only practical with a
 * controllable mock, mirroring the exact pattern already established in
 * seller.service.sync.spec.ts (Stage A2) for the same class of test.
 */
describe('BusinessCapabilityApplicationService.applyForCapability() — transaction rollback (Stage B2 mission §31 items 23-25)', () => {
  const OWNER_CHAIN_ROW = [{
    businessId: 1, businessStatus: 'active',
    workspaceId: 10, workspaceStatus: 'active',
    membershipId: 100, membershipStatus: 'active', roleTemplate: 'owner',
    workspaceAssignmentId: 1000, assignmentStatus: 'active',
  }];

  const buildService = (opts: { failAt?: 'profile' | 'role' | 'application' } = {}) => {
    const profileSave = jest.fn((d: any) =>
      opts.failAt === 'profile' ? Promise.reject(new Error('profile save failed')) : Promise.resolve({ ...d, id: 501 }),
    );
    const roleSave = jest.fn((d: any) =>
      opts.failAt === 'role' ? Promise.reject(new Error('role save failed')) : Promise.resolve({ ...d, id: 601 }),
    );
    const applicationSave = jest.fn((d: any) =>
      opts.failAt === 'application' ? Promise.reject(new Error('application save failed')) : Promise.resolve({ ...d, id: 701 }),
    );

    const txProfileRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((d: any) => d), save: profileSave };
    const txRoleRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((d: any) => d), save: roleSave };
    const txApplicationRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((d: any) => d), save: applicationSave };
    const txBusinessRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, tradingName: 'Co', legalName: 'Co', description: null, category: null, address: null, phone: null, regionId: null, region: null, districtId: null, district: null, wardId: null, ward: null, registrationNumber: null, tinNumber: null, businessLicenseNumber: null }) };

    const txCapabilityRepo = { findOne: jest.fn().mockResolvedValue(null) };

    const getRepository = jest.fn((entity: any) => {
      if (entity === BusinessCapabilityApplication) return txApplicationRepo;
      if (entity === Business) return txBusinessRepo;
      if (entity === SellerProfile) return txProfileRepo;
      if (entity === AccountRole) return txRoleRepo;
      if (entity === BusinessCapability) return txCapabilityRepo;
      throw new Error(`unexpected repo requested inside transaction: ${entity?.name}`);
    });

    const txManager: any = { getRepository, query: jest.fn().mockResolvedValue(OWNER_CHAIN_ROW) };

    const outerCapabilityRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const outerApplicationRepo: any = { findOne: jest.fn() };

    const dataSource: any = {
      manager: { query: jest.fn().mockResolvedValue(OWNER_CHAIN_ROW), getRepository },
      transaction: jest.fn(async (cb: any) => cb(txManager)),
    };

    const service = new BusinessCapabilityApplicationService(outerApplicationRepo, outerCapabilityRepo, dataSource);
    return { service, profileSave, roleSave, applicationSave, dataSource };
  };

  const user: any = { id: 2, activeRoles: [] };

  it('23. a profile-save failure rolls back the transaction -- role and application are never even attempted', async () => {
    const { service, roleSave, applicationSave } = buildService({ failAt: 'profile' });
    await expect(service.applyForCapability(1, 'commerce', user, {})).rejects.toThrow('profile save failed');
    expect(roleSave).not.toHaveBeenCalled();
    expect(applicationSave).not.toHaveBeenCalled();
  });

  it('24. an AccountRole-save failure rolls back the transaction -- the profile write happened only inside the (rolled-back) transaction, and the application is never attempted', async () => {
    const { service, profileSave, applicationSave } = buildService({ failAt: 'role' });
    await expect(service.applyForCapability(1, 'commerce', user, {})).rejects.toThrow('role save failed');
    expect(profileSave).toHaveBeenCalledTimes(1); // attempted, but the surrounding dataSource.transaction() callback throws -> real Postgres rolls back
    expect(applicationSave).not.toHaveBeenCalled();
  });

  it('25. an Application-save failure rolls back the transaction -- profile and role were both attempted, but the whole callback still throws so nothing durable commits', async () => {
    const { service, profileSave, roleSave } = buildService({ failAt: 'application' });
    await expect(service.applyForCapability(1, 'commerce', user, {})).rejects.toThrow('application save failed');
    expect(profileSave).toHaveBeenCalledTimes(1);
    expect(roleSave).toHaveBeenCalledTimes(1);
  });

  it('the success path calls all three saves exactly once, in profile -> role -> application order', async () => {
    const { service, profileSave, roleSave, applicationSave } = buildService();
    const result = await service.applyForCapability(1, 'commerce', user, {});
    expect(profileSave).toHaveBeenCalledTimes(1);
    expect(roleSave).toHaveBeenCalledTimes(1);
    expect(applicationSave).toHaveBeenCalledTimes(1);
    expect(profileSave.mock.invocationCallOrder[0]).toBeLessThan(roleSave.mock.invocationCallOrder[0]);
    expect(roleSave.mock.invocationCallOrder[0]).toBeLessThan(applicationSave.mock.invocationCallOrder[0]);
    expect(result.application.id).toBe(701);
    expect(result.operationalProfile.id).toBe(501);
    expect(result.accountRole.id).toBe(601);
  });

  it('a raw Postgres unique-violation on UQ_bca_workspace_code_pending is translated to a clean CAPABILITY_APPLICATION_ALREADY_PENDING conflict, never leaked as raw SQL text', async () => {
    const { service, dataSource } = buildService();
    dataSource.transaction.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint "UQ_bca_workspace_code_pending"'), { code: '23505' }),
    );
    await expect(service.applyForCapability(1, 'commerce', user, {}))
      .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
  });

  it('a raw Postgres unique-violation on UQ_seller_profile_business is translated to a clean conflict, never leaked as raw SQL text', async () => {
    const { service, dataSource } = buildService();
    dataSource.transaction.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint "UQ_seller_profile_business"'), { code: '23505' }),
    );
    await expect(service.applyForCapability(1, 'commerce', user, {}))
      .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
  });
});
