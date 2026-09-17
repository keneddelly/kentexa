import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from '../business/b5b-closure-test-db';
import { Business, BusinessStatus } from '../business/entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from '../business/entities/operational-workspace.entity';
import { User } from '../users/entities/user.entity';
import {
  CommerceProfile,
  CommerceProfileType,
  CommerceProfileStatus,
} from './entities/commerce-profile.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';
import { CommerceProfileScopeService } from './commerce-profile-scope.service';
import { RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Identity Fix I1 — real-Postgres proof that Personal and Business
 * attribution never collapse into each other merely because they belong
 * to the same underlying User, and that a User running MULTIPLE
 * Businesses gets each one resolved independently. This is the exact
 * regression scenario from the Personal Classified Attribution incident
 * (Kened/BIS) plus its multi-business extension.
 */
describe('Personal/Business identity attribution integrity, real disposable-DB', () => {
  let client: Client;
  let dataSource: DataSource;
  let scopeService: CommerceProfileScopeService;

  let kened: User;
  let bis: Business;
  let businessB: Business;
  let bisWorkspace: OperationalWorkspace;
  let businessBWorkspace: OperationalWorkspace;
  let kenedPersonalProfile: CommerceProfile;
  let bisProfile: CommerceProfile;
  let businessBProfile: CommerceProfile;

  beforeAll(async () => {
    const config = getB5BTestConnectionConfig();
    client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await bootstrapB5BTestSchema(config);

    dataSource = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user,
      password: config.password, database: config.database, synchronize: false,
      entities: B5B_ALL_ENTITIES,
    });
    await dataSource.initialize();

    const userRepo = dataSource.getRepository(User);
    const businessRepo = dataSource.getRepository(Business);
    const workspaceRepo = dataSource.getRepository(OperationalWorkspace);
    const profileRepo = dataSource.getRepository(CommerceProfile);
    const memberRepo = dataSource.getRepository(CommerceProfileMember);

    scopeService = new CommerceProfileScopeService(profileRepo as any, memberRepo as any, workspaceRepo as any);

    kened = await userRepo.save(
      userRepo.create({ name: 'Kened', email: 'kened@example.com', password: 'x', phone: '255700000001' } as any),
    );

    bis = await businessRepo.save(
      businessRepo.create({ legalName: 'Bishoo Intelligence Systems', user: kened, status: BusinessStatus.ACTIVE } as any),
    );
    businessB = await businessRepo.save(
      businessRepo.create({ legalName: 'Business B', user: kened, status: BusinessStatus.ACTIVE } as any),
    );

    bisWorkspace = await workspaceRepo.save(
      workspaceRepo.create({ business: bis, businessId: bis.id, name: 'BIS Commerce', status: OperationalWorkspaceStatus.ACTIVE } as any),
    );
    businessBWorkspace = await workspaceRepo.save(
      workspaceRepo.create({ business: businessB, businessId: businessB.id, name: 'Business B Commerce', status: OperationalWorkspaceStatus.ACTIVE } as any),
    );

    kenedPersonalProfile = await profileRepo.save(
      profileRepo.create({
        owner: kened, ownerId: kened.id, type: CommerceProfileType.PERSONAL,
        status: CommerceProfileStatus.ACTIVE, displayName: 'Kened', username: 'kened',
      } as any),
    );
    bisProfile = await profileRepo.save(
      profileRepo.create({
        owner: kened, ownerId: kened.id, businessId: bis.id, type: CommerceProfileType.BUSINESS,
        status: CommerceProfileStatus.ACTIVE, displayName: 'Bishoo Intelligence Systems', username: 'bis',
      } as any),
    );
    businessBProfile = await profileRepo.save(
      profileRepo.create({
        owner: kened, ownerId: kened.id, businessId: businessB.id, type: CommerceProfileType.BUSINESS,
        status: CommerceProfileStatus.ACTIVE, displayName: 'Business B', username: 'businessb',
      } as any),
    );
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy().catch(() => {});
    if (client) await client.end().catch(() => {});
  });

  it('§0 explicit connectivity assertion', async () => {
    const identity = await dataSource.query('SELECT current_database() AS db, current_user AS usr');
    expect(identity[0].db).toBe('kentexa_b5b_test');
    expect(identity[0].usr).toBe('kentexa_b5b_test_user');
  });

  it('Kened acting PERSONALLY resolves to his own PERSONAL CommerceProfile, never BIS or Business B', async () => {
    const resolved = await scopeService.resolveForListingScope({
      legacySellerId: kened.id,
      workspaceId: null,
      businessId: null,
      mode: 'legacy',
      profileType: RoleProfileType.USER,
      profileId: kened.id,
    });
    expect(resolved).toBe(kenedPersonalProfile.id);
    expect(resolved).not.toBe(bisProfile.id);
    expect(resolved).not.toBe(businessBProfile.id);
  });

  it('Kened acting as BIS (workspace context) resolves to BIS\'s own CommerceProfile, never his Personal one or Business B\'s', async () => {
    const resolved = await scopeService.resolveForListingScope({
      legacySellerId: kened.id,
      workspaceId: bisWorkspace.id,
      businessId: bis.id,
      mode: 'workspace',
    });
    expect(resolved).toBe(bisProfile.id);
    expect(resolved).not.toBe(kenedPersonalProfile.id);
    expect(resolved).not.toBe(businessBProfile.id);
  });

  it('Kened acting as Business B (workspace context) resolves to Business B\'s own CommerceProfile, never BIS\'s or his Personal one', async () => {
    const resolved = await scopeService.resolveForListingScope({
      legacySellerId: kened.id,
      workspaceId: businessBWorkspace.id,
      businessId: businessB.id,
      mode: 'workspace',
    });
    expect(resolved).toBe(businessBProfile.id);
    expect(resolved).not.toBe(bisProfile.id);
    expect(resolved).not.toBe(kenedPersonalProfile.id);
  });

  it('context-switch sequence: Personal -> BIS -> Personal -> Business B never leaks stale attribution between calls', async () => {
    const personal1 = await scopeService.resolveForListingScope({
      legacySellerId: kened.id, workspaceId: null, businessId: null,
      mode: 'legacy', profileType: RoleProfileType.USER, profileId: kened.id,
    });
    const asBis = await scopeService.resolveForListingScope({
      legacySellerId: kened.id, workspaceId: bisWorkspace.id, businessId: bis.id, mode: 'workspace',
    });
    const personal2 = await scopeService.resolveForListingScope({
      legacySellerId: kened.id, workspaceId: null, businessId: null,
      mode: 'legacy', profileType: RoleProfileType.USER, profileId: kened.id,
    });
    const asBusinessB = await scopeService.resolveForListingScope({
      legacySellerId: kened.id, workspaceId: businessBWorkspace.id, businessId: businessB.id, mode: 'workspace',
    });

    expect(personal1).toBe(kenedPersonalProfile.id);
    expect(asBis).toBe(bisProfile.id);
    expect(personal2).toBe(kenedPersonalProfile.id);
    expect(asBusinessB).toBe(businessBProfile.id);
  });
});
