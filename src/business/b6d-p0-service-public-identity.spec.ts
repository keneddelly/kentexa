import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
  B5B_TEST_DB_NAME,
  B5B_TEST_DB_USER,
} from './b5b-closure-test-db';
import { Business, BusinessStatus } from './entities/business.entity';
import { User } from '../users/entities/user.entity';
import {
  CommerceProfile,
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { ServiceAd, ServiceCategory, PriceType, ServiceStatus } from '../services/entities/service-ad.entity';
import { JobRequest } from '../services/entities/job-request.entity';
import { ServicesService } from '../services/services.service';

/**
 * B6D-P0 — Service public boundary & identity hardening. Real disposable
 * schema inside the dedicated kentexa_b5b_test database, reusing the exact
 * same shared safety harness as every B5B/B5C/B6B/I1 spec.
 *
 * Two things this file proves against genuinely real Postgres, not mocks:
 *   1. No public ServiceAd read path (getById/browse/search/featured/
 *      category) ever serializes a raw User entity — private/financial
 *      fields (email, payout*) must never appear in the returned object,
 *      even though the object is otherwise the exact shape that would be
 *      JSON-serialized straight to an HTTP client. This is a
 *      response-shape assertion (JSON.stringify + toContain), not a query-
 *      column-selection assertion, per the mission's own explicit
 *      requirement that this be response-level, not repository-level.
 *   2. The canonical public actor resolver never infers Business
 *      attribution from "this provider happens to own a Business" — only
 *      from the ad's own commerceProfileId/businessId, with a Personal
 *      fallback for genuinely ambiguous/legacy rows.
 */
describe('B6D-P0 — Service public boundary & identity hardening, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let servicesService: ServicesService;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const profileRepo = () => ds.getRepository(CommerceProfile);
  const adRepo = () => ds.getRepository(ServiceAd);

  const makeUser = async (overrides: Partial<User> = {}) => {
    const n = ++seq;
    return userRepo().save(
      userRepo().create({
        email: `u${n}@b6d-test.local`,
        phone: `+2551${String(n).padStart(8, '0')}`,
        password: 'x',
        name: `U${n}`,
        ...overrides,
      } as any),
    );
  };

  const makeBusiness = async (owner: User, name: string) =>
    businessRepo().save(
      businessRepo().create({ legalName: name, tradingName: name, user: owner, status: BusinessStatus.ACTIVE } as any),
    );

  const makePersonalProfile = async (owner: User) => {
    const n = ++seq;
    return profileRepo().save(
      profileRepo().create({
        owner,
        ownerId: owner.id,
        type: CommerceProfileType.PERSONAL,
        status: CommerceProfileStatus.ACTIVE,
        displayName: owner.name,
        username: `personal${n}`,
      } as any),
    );
  };

  const makeBusinessProfile = async (owner: User, business: Business, name: string) => {
    const n = ++seq;
    return profileRepo().save(
      profileRepo().create({
        owner,
        ownerId: owner.id,
        businessId: business.id,
        type: CommerceProfileType.BUSINESS,
        status: CommerceProfileStatus.ACTIVE,
        displayName: name,
        username: `biz${n}`,
      } as any),
    );
  };

  const makeAd = async (provider: User, overrides: Partial<ServiceAd> = {}) =>
    adRepo().save(
      adRepo().create({
        providerId: provider.id,
        title: 'Service',
        description: 'd',
        category: ServiceCategory.UFUNDI,
        priceType: PriceType.PER_JOB,
        price: 1000,
        coverageCity: 'Dar es Salaam',
        images: ['x.jpg'],
        status: ServiceStatus.ACTIVE,
        totalJobs: 0,
        rating: 0,
        views: 0,
        isVerified: false,
        isAvailableNow: true,
        isAvailableForBooking: true,
        commerceProfileId: null,
        businessId: null,
        ...overrides,
      } as any),
    );

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config);

    ds = new DataSource({
      type: 'postgres',
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.password,
      database: config.database,
      synchronize: false,
      entities: [...B5B_ALL_ENTITIES, JobRequest],
    });
    await ds.initialize();

    servicesService = new ServicesService(
      adRepo(),
      ds.getRepository(JobRequest),
      { publish: async () => undefined } as any,
      {} as any,
      { isAuthorizedFor: async () => false } as any,
      { upsert: async () => undefined, remove: async () => undefined } as any,
    );
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy().catch(() => {});
  });

  it('§0 explicit connectivity assertion', async () => {
    expect(reachable).toBe(true);
    const rows = await ds.query('SELECT current_database() AS db, current_user AS usr');
    expect(rows[0].db).toBe(B5B_TEST_DB_NAME);
    expect(rows[0].usr).toBe(B5B_TEST_DB_USER);
  });

  describe('A — public data minimization (privacy)', () => {
    const SENTINEL = {
      email: 'sentinel-email-should-never-leak@b6d-test.local',
      payoutAccountName: 'SENTINEL_PAYOUT_ACCOUNT_NAME',
      payoutAccountNumber: 'SENTINEL_PAYOUT_ACCOUNT_NUMBER',
      payoutBankName: 'SENTINEL_PAYOUT_BANK_NAME',
      payoutBranchName: 'SENTINEL_PAYOUT_BRANCH_NAME',
      payoutMethod: 'bank',
    };
    const SENTINEL_PHONE = '+255700000999';
    let sentinelProvider: User;
    let sentinelAd: ServiceAd;

    beforeAll(async () => {
      if (!reachable) return;
      sentinelProvider = await makeUser({ phone: SENTINEL_PHONE, ...SENTINEL } as any);
      sentinelAd = await makeAd(sentinelProvider, { title: 'Sentinel Ad Unique Title' });
    });

    const assertNoLeak = (payload: unknown) => {
      const json = JSON.stringify(payload);
      expect(json).not.toContain(SENTINEL.email);
      expect(json).not.toContain(SENTINEL.payoutAccountName);
      expect(json).not.toContain(SENTINEL.payoutAccountNumber);
      expect(json).not.toContain(SENTINEL.payoutBankName);
      expect(json).not.toContain(SENTINEL.payoutBranchName);
    };

    it('1. getById() contains no private User/financial fields, and DOES intentionally expose phone as the curated contact field', async () => {
      if (!reachable) return;
      const result = await servicesService.getById(sentinelAd.id);
      assertNoLeak(result);
      expect((result as any).provider?.phone).toBe(SENTINEL_PHONE);
      expect((result as any).provider?.email).toBeUndefined();
      expect((result as any).provider?.payoutAccountNumber).toBeUndefined();
    });

    it('2. browse() contains no private User/financial fields', async () => {
      if (!reachable) return;
      const { ads } = await servicesService.browse({ q: 'Sentinel Ad Unique' });
      assertNoLeak(ads);
      expect(ads.length).toBeGreaterThan(0);
    });

    it('3. search() contains no private User/financial fields', async () => {
      if (!reachable) return;
      const ads = await servicesService.search('Sentinel Ad Unique Title');
      assertNoLeak(ads);
      expect(ads.length).toBeGreaterThan(0);
    });

    it('4. featured()/category() contain no raw User leakage', async () => {
      if (!reachable) return;
      await adRepo().update(sentinelAd.id, { isVerified: true });
      const featured = await servicesService.getFeatured(100);
      assertNoLeak(featured);
      const byCategory = await servicesService.getByCategory(ServiceCategory.UFUNDI, 100);
      assertNoLeak(byCategory);
    });
  });

  describe('B — canonical actor resolution', () => {
    let kened: User;
    let bis: Business;
    let businessB: Business;
    let kenedPersonal: CommerceProfile;
    let bisProfile: CommerceProfile;
    let businessBProfile: CommerceProfile;
    let personalAd: ServiceAd;
    let bisAd: ServiceAd;
    let businessBAd: ServiceAd;
    let legacyAd: ServiceAd;

    beforeAll(async () => {
      if (!reachable) return;
      kened = await makeUser({ name: 'Kened' } as any);
      bis = await makeBusiness(kened, 'Bishoo Intelligence Systems');
      businessB = await makeBusiness(kened, 'Business B');
      kenedPersonal = await makePersonalProfile(kened);
      bisProfile = await makeBusinessProfile(kened, bis, 'Bishoo Intelligence Systems');
      businessBProfile = await makeBusinessProfile(kened, businessB, 'Business B');

      personalAd = await makeAd(kened, { title: 'Kened Personal Service', commerceProfileId: kenedPersonal.id });
      bisAd = await makeAd(kened, { title: 'BIS Service', businessId: bis.id });
      businessBAd = await makeAd(kened, { title: 'Business B Service', businessId: businessB.id });
      legacyAd = await makeAd(kened, { title: 'Legacy Service, both null' });
    });

    it('5. Personal Service (owner also owns a Business) resolves Personal', async () => {
      if (!reachable) return;
      const result = await servicesService.getById(personalAd.id);
      expect((result as any).commerceProfile?.id).toBe(kenedPersonal.id);
      expect((result as any).commerceProfile?.id).not.toBe(bisProfile.id);
      expect((result as any).commerceProfile?.id).not.toBe(businessBProfile.id);
    });

    it('6. Business A Service resolves Business A', async () => {
      if (!reachable) return;
      const result = await servicesService.getById(bisAd.id);
      expect((result as any).commerceProfile?.id).toBe(bisProfile.id);
    });

    it('7. Business B Service resolves Business B', async () => {
      if (!reachable) return;
      const result = await servicesService.getById(businessBAd.id);
      expect((result as any).commerceProfile?.id).toBe(businessBProfile.id);
    });

    it('8. Same-owner businesses never cross', async () => {
      if (!reachable) return;
      const a = await servicesService.getById(bisAd.id);
      const b = await servicesService.getById(businessBAd.id);
      expect((a as any).commerceProfile?.id).not.toBe((b as any).commerceProfile?.id);
    });

    it('12. Business Service detail actor matches its listing actor', async () => {
      if (!reachable) return;
      const detail = await servicesService.getById(bisAd.id);
      const listed = await servicesService.findForCommerceProfile(bisProfile.id);
      expect(listed.map((a) => a.id)).toContain(bisAd.id);
      expect((detail as any).commerceProfile?.id).toBe(bisProfile.id);
    });

    it('13. Legacy null attribution never invents an arbitrary Business -- fails toward Personal', async () => {
      if (!reachable) return;
      const result = await servicesService.getById(legacyAd.id);
      expect((result as any).commerceProfile?.id).toBe(kenedPersonal.id);
      expect((result as any).commerceProfile?.id).not.toBe(bisProfile.id);
      expect((result as any).commerceProfile?.id).not.toBe(businessBProfile.id);
    });

    describe('C — public profile Services scoping', () => {
      it('9. Personal public profile returns Personal Services only', async () => {
        if (!reachable) return;
        const ads = await servicesService.findForCommerceProfile(kenedPersonal.id);
        const ids = ads.map((a) => a.id);
        expect(ids).toContain(personalAd.id);
        expect(ids).not.toContain(bisAd.id);
        expect(ids).not.toContain(businessBAd.id);
      });

      it('10. Business A profile returns A only', async () => {
        if (!reachable) return;
        const ads = await servicesService.findForCommerceProfile(bisProfile.id);
        const ids = ads.map((a) => a.id);
        expect(ids).toContain(bisAd.id);
        expect(ids).not.toContain(businessBAd.id);
        expect(ids).not.toContain(personalAd.id);
      });

      it('11. Business B profile returns B only', async () => {
        if (!reachable) return;
        const ads = await servicesService.findForCommerceProfile(businessBProfile.id);
        const ids = ads.map((a) => a.id);
        expect(ids).toContain(businessBAd.id);
        expect(ids).not.toContain(bisAd.id);
        expect(ids).not.toContain(personalAd.id);
      });
    });
  });
});
