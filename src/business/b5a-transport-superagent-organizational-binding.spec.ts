import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { TransportProvider, ProviderType } from '../transport/entities/transport-provider.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';

/**
 * Business Capability Activation Stage B5A (mission §9/§10 test matrix).
 * Real disposable Postgres, same technique as B3/B4's own specs -- partial
 * unique index enforcement can only be genuinely proven against a real
 * database, not mocks.
 */
describe('TransportProvider/SuperAgent organizational binding (Stage B5A), real disposable-DB', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_b5a_organizational_binding_test';
  const ENTITIES = [Business, OperationalWorkspace, TransportProvider, SuperAgent, User];

  let reachable = false;
  let adminClient: Client;
  let ds: DataSource;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const workspaceRepo = () => ds.getRepository(OperationalWorkspace);
  const transportRepo = () => ds.getRepository(TransportProvider);
  const superAgentRepo = () => ds.getRepository(SuperAgent);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b5a-test.local`, phone: `+2556${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

  const makeBusiness = async (owner: User) => {
    const n = ++seq;
    return businessRepo().save(businessRepo().create({ legalName: `Co ${n}`, tradingName: `Co ${n}`, user: owner } as any));
  };

  const makeWorkspace = async (business: Business, name: string, isDefault = false) =>
    workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name, isDefault } as any));

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }

    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminClient.end();

    ds = new DataSource({
      type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME, synchronize: true, entities: ENTITIES,
    });
    await ds.initialize();
  }, 60000);

  afterAll(async () => {
    if (!reachable) return;
    if (ds?.isInitialized) await ds.destroy();
    const admin = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
  }, 90000);

  describe('TransportProvider organizational identity (mission §9)', () => {
    it('Business A gets TransportProvider A and Business B gets TransportProvider B for the same user -- no collision', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const businessA = await makeBusiness(owner);
      const businessB = await makeBusiness(owner);

      const providerA = await transportRepo().save(transportRepo().create({
        name: 'ABC Transport A', type: ProviderType.BUS, businessId: businessA.id,
      } as any));
      const providerB = await transportRepo().save(transportRepo().create({
        name: 'ABC Transport B', type: ProviderType.BUS, businessId: businessB.id,
      } as any));

      expect(providerA.id).not.toBe(providerB.id);
      expect(providerA.businessId).toBe(businessA.id);
      expect(providerB.businessId).toBe(businessB.id);
    });

    it('two TransportProvider rows with the SAME non-null businessId violate uniqueness', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const business = await makeBusiness(owner);
      await transportRepo().save(transportRepo().create({ name: 'First', type: ProviderType.BUS, businessId: business.id } as any));

      await expect(
        transportRepo().save(transportRepo().create({ name: 'Duplicate', type: ProviderType.BUS, businessId: business.id } as any)),
      ).rejects.toThrow();
    });

    it('legacy unbound semantics preserved: two TransportProvider rows with businessId NULL for the SAME userId violate the unbound-uniqueness rule', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      await transportRepo().save(transportRepo().create({ name: 'Legacy 1', type: ProviderType.BUS, userId: owner.id, businessId: null } as any));

      await expect(
        transportRepo().save(transportRepo().create({ name: 'Legacy 2', type: ProviderType.BUS, userId: owner.id, businessId: null } as any)),
      ).rejects.toThrow();
    });

    it('multiple unbound (businessId NULL) rows for DIFFERENT users coexist freely -- matches the zero-duplicate production baseline', async () => {
      if (!reachable) return;
      const owner1 = await makeUser();
      const owner2 = await makeUser();
      const p1 = await transportRepo().save(transportRepo().create({ name: 'Indep 1', type: ProviderType.BUS, userId: owner1.id, businessId: null } as any));
      const p2 = await transportRepo().save(transportRepo().create({ name: 'Indep 2', type: ProviderType.BUS, userId: owner2.id, businessId: null } as any));
      expect(p1.id).not.toBe(p2.id);
    });
  });

  describe('SuperAgent organizational identity (mission §9)', () => {
    it('Workspace Kariakoo gets SuperAgent Kariakoo, Workspace Ubungo gets SuperAgent Ubungo -- same user may operate both', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const business = await makeBusiness(owner);
      const kariakoo = await makeWorkspace(business, 'Kariakoo');
      const ubungo = await makeWorkspace(business, 'Ubungo');

      const agentKariakoo = await superAgentRepo().save(superAgentRepo().create({
        user: owner, businessName: 'ABC Cargo Kariakoo', city: 'Dar es Salaam', workspaceId: kariakoo.id,
      } as any));
      const agentUbungo = await superAgentRepo().save(superAgentRepo().create({
        user: owner, businessName: 'ABC Cargo Ubungo', city: 'Dar es Salaam', workspaceId: ubungo.id,
      } as any));

      expect(agentKariakoo.id).not.toBe(agentUbungo.id);
      expect(agentKariakoo.workspaceId).toBe(kariakoo.id);
      expect(agentUbungo.workspaceId).toBe(ubungo.id);
    });

    it('two SuperAgent rows with the SAME non-null workspaceId violate uniqueness', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const business = await makeBusiness(owner);
      const workspace = await makeWorkspace(business, 'Mwanza');
      await superAgentRepo().save(superAgentRepo().create({ user: owner, businessName: 'First', city: 'Mwanza', workspaceId: workspace.id } as any));

      const owner2 = await makeUser();
      await expect(
        superAgentRepo().save(superAgentRepo().create({ user: owner2, businessName: 'Duplicate', city: 'Mwanza', workspaceId: workspace.id } as any)),
      ).rejects.toThrow();
    });

    it('legacy unbound semantics preserved: two SuperAgent rows with workspaceId NULL for the SAME userId violate the unbound-uniqueness rule', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      await superAgentRepo().save(superAgentRepo().create({ user: owner, businessName: 'Legacy 1', city: 'Dodoma', workspaceId: null } as any));

      await expect(
        superAgentRepo().save(superAgentRepo().create({ user: owner, businessName: 'Legacy 2', city: 'Dodoma', workspaceId: null } as any)),
      ).rejects.toThrow();
    });

    it('multiple unbound (workspaceId NULL) rows for DIFFERENT users coexist freely -- matches the zero-duplicate production baseline', async () => {
      if (!reachable) return;
      const owner1 = await makeUser();
      const owner2 = await makeUser();
      const a1 = await superAgentRepo().save(superAgentRepo().create({ user: owner1, businessName: 'Indep 1', city: 'Arusha', workspaceId: null } as any));
      const a2 = await superAgentRepo().save(superAgentRepo().create({ user: owner2, businessName: 'Indep 2', city: 'Arusha', workspaceId: null } as any));
      expect(a1.id).not.toBe(a2.id);
    });
  });

  describe('Relation resolution (mission §10)', () => {
    it('TransportProvider.business resolves the correct Business', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const business = await makeBusiness(owner);
      const provider = await transportRepo().save(transportRepo().create({ name: 'Resolve Co', type: ProviderType.TRUCK, businessId: business.id } as any));

      const loaded = await transportRepo().findOne({ where: { id: provider.id }, relations: { business: true } });
      expect(loaded?.business?.id).toBe(business.id);
      expect(loaded?.business?.legalName).toBe(business.legalName);
    });

    it('SuperAgent.workspace resolves the correct OperationalWorkspace, and workspace.businessId gives canonical Business lineage -- SuperAgent itself carries no redundant businessId', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const business = await makeBusiness(owner);
      const workspace = await makeWorkspace(business, 'Kigoma Hub');
      const agent = await superAgentRepo().save(superAgentRepo().create({ user: owner, businessName: 'Kigoma Cargo', city: 'Kigoma', workspaceId: workspace.id } as any));

      const loaded = await superAgentRepo().findOne({ where: { id: agent.id }, relations: { workspace: true } });
      expect(loaded?.workspace?.id).toBe(workspace.id);
      expect(loaded?.workspace?.businessId).toBe(business.id); // canonical lineage, resolved indirectly
      expect((loaded as any).businessId).toBeUndefined(); // never a direct field
    });

    it('legacy unbound rows resolve their relation as null without error', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const provider = await transportRepo().save(transportRepo().create({ name: 'Unbound', type: ProviderType.VAN, userId: owner.id, businessId: null } as any));
      const agent = await superAgentRepo().save(superAgentRepo().create({ user: owner, businessName: 'Unbound Agent', city: 'Tanga', workspaceId: null } as any));

      const loadedProvider = await transportRepo().findOne({ where: { id: provider.id }, relations: { business: true } });
      const loadedAgent = await superAgentRepo().findOne({ where: { id: agent.id }, relations: { workspace: true } });
      expect(loadedProvider?.business).toBeNull();
      expect(loadedAgent?.workspace).toBeNull();
    });
  });
});
