import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { parseArgs, main, REQUIRED_CONFIRMATION_TOKEN } from './complete-ambiguous-buyer-participants';
import { Conversation, ConversationClassificationStatus } from '../business/entities/conversation.entity';
import { BusinessCustomer } from '../business/entities/business-customer.entity';
import { ConversationParticipant, ParticipantKind, ParticipantPrincipalType, ParticipantStatus } from '../business/entities/conversation-participant.entity';
import { ConversationParticipantState } from '../business/entities/conversation-participant-state.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';

const SOURCE = fs.readFileSync(path.join(__dirname, 'complete-ambiguous-buyer-participants.ts'), 'utf8');

describe('complete-ambiguous-buyer-participants -- parseArgs (pure, no DB)', () => {
  it('requires --conversation-ids', () => {
    expect(() => parseArgs([])).toThrow(/--conversation-ids is required/);
  });

  it('rejects a non-integer in --conversation-ids', () => {
    expect(() => parseArgs(['--conversation-ids', '7,abc'])).toThrow(/non-integer/);
  });

  it('parses a comma-separated list', () => {
    expect(parseArgs(['--conversation-ids', '7,8,14,17']).conversationIds).toEqual([7, 8, 14, 17]);
  });

  it('defaults to dry-run', () => {
    expect(parseArgs(['--conversation-ids', '7']).execute).toBe(false);
  });

  it('--execute requires the exact confirmation token', () => {
    expect(() => parseArgs(['--execute', '--conversation-ids', '7'])).toThrow(/requires --confirm-production-participant-completion/);
    expect(() => parseArgs(['--execute', '--conversation-ids', '7', '--confirm-production-participant-completion', 'wrong'])).toThrow(/requires --confirm-production-participant-completion/);
    expect(() => parseArgs(['--execute', '--conversation-ids', '7', '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN])).not.toThrow();
  });

  it('rejects unknown arguments', () => {
    expect(() => parseArgs(['--conversation-ids', '7', '--YOLO'])).toThrow(/Unknown argument/);
  });

  it('rejects duplicate arguments', () => {
    expect(() => parseArgs(['--conversation-ids', '7', '--conversation-ids', '8'])).toThrow(/Duplicate argument/);
  });
});

describe('complete-ambiguous-buyer-participants -- structural safety proofs', () => {
  const importLines = SOURCE.split('\n').filter((l) => /^\s*import\b/.test(l));
  it('never bootstraps Nest / never uses classifyAndBackfillBatch / never writes classificationStatus', () => {
    expect(importLines.some((l) => /NestFactory|@nestjs\/schedule|AppModule/.test(l))).toBe(false);
    expect(SOURCE).not.toMatch(/classifyAndBackfillBatch/);
    expect(SOURCE).not.toMatch(/classificationStatus\s*:/); // never a write payload containing this key
    expect(SOURCE).not.toMatch(/ParticipantKind\.SELLER/); // this tool never touches the Seller side
  });
});

describe('complete-ambiguous-buyer-participants -- end-to-end against a disposable database', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_buyer_completion_test';
  const ENTITIES = [Conversation, BusinessCustomer, AccountRole, ConversationParticipant, ConversationParticipantState, User, SellerProfile, Agent, SuperAgent, TransportProvider, ActiveRoleSession];

  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;
  let seq = 0;

  const userRepo = () => dataSource.getRepository(User);
  const roleRepo = () => dataSource.getRepository(AccountRole);
  const customerRepo = () => dataSource.getRepository(BusinessCustomer);
  const convoRepo = () => dataSource.getRepository(Conversation);
  const participantRepo = () => dataSource.getRepository(ConversationParticipant);

  const makeUser = async (tag: string) => { const n = ++seq; return userRepo().save(userRepo().create({ email: `${tag}${n}@buyer-completion-test.local`, phone: `+2557${String(n).padStart(8, '0')}`, password: 'x', name: tag } as any)); };
  const makeBuyerRole = async (userId: number) => roleRepo().save(roleRepo().create({ userId, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: userId } as any));
  const makeCustomer = async (sellerId: number, userId: number, name: string) => customerRepo().save(customerRepo().create({ sellerId, userId, name, channel: 'kentexa' } as any));
  const makeAmbiguousConvo = async (sellerId: number, customerId: number) => convoRepo().save(convoRepo().create({ sellerId, customerId, classificationStatus: ConversationClassificationStatus.AMBIGUOUS, classificationReason: 'no_active_seller_account_role', classifiedAt: new Date() } as any));

  const seedConversation2Shape = async () => {
    const ghostSeller = await makeUser('GhostSeller'); // deliberately: no seller role
    const buyer = await makeUser('Buyer');
    const buyerRole = await makeBuyerRole(buyer.id);
    const customer = await makeCustomer(ghostSeller.id, buyer.id, 'Buyer');
    const convo = await makeAmbiguousConvo(ghostSeller.id, customer.id);
    return { convo, ghostSeller, buyer, buyerRole, customer };
  };

  const resetDb = async () => {
    await dataSource.query('delete from conversation_participant_state');
    await dataSource.query('delete from conversation_participant');
    await dataSource.query('delete from conversation');
    await dataSource.query('delete from business_customer');
    await dataSource.query('delete from account_role');
    await dataSource.query('delete from "user"');
  };

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }
    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    dataSource = new DataSource({ type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: TEST_DB_NAME, synchronize: true, entities: ENTITIES });
    await dataSource.initialize();
  }, 60000);

  beforeEach(async () => { if (reachable) await resetDb(); }, 30000);

  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) { await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`); await adminClient.end(); }
  }, 90000);

  it('dry run performs zero writes', async () => {
    if (!reachable) return;
    const { convo, buyerRole } = await seedConversation2Shape();
    const code = await main(['--conversation-ids', String(convo.id)], dataSource);
    expect(code).toBe(0);
    expect(await participantRepo().count()).toBe(0);
    void buyerRole;
  });

  it('execute creates exactly the canonical Buyer participant, never touching classificationStatus/reason', async () => {
    if (!reachable) return;
    const { convo, buyerRole } = await seedConversation2Shape();
    const code = await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const participants = await participantRepo().find({ where: { conversationId: convo.id } });
    expect(participants).toHaveLength(1);
    expect(participants[0].accountRoleId).toBe(buyerRole.id);
    expect(participants[0].participantKind).toBe(ParticipantKind.BUYER);
    const reloaded = await convoRepo().findOne({ where: { id: convo.id } });
    expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.AMBIGUOUS);
    expect(reloaded?.classificationReason).toBe('no_active_seller_account_role');
  });

  it('is idempotent -- a second execute run does not duplicate the participant', async () => {
    if (!reachable) return;
    const { convo } = await seedConversation2Shape();
    await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    const code = await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await participantRepo().count({ where: { conversationId: convo.id } })).toBe(1);
  });

  it('never creates a Seller participant, never creates/activates a Seller AccountRole', async () => {
    if (!reachable) return;
    const { convo, ghostSeller } = await seedConversation2Shape();
    await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    const sellerParticipants = await participantRepo().find({ where: { conversationId: convo.id, participantKind: ParticipantKind.SELLER } });
    expect(sellerParticipants).toHaveLength(0);
    const sellerRoles = await roleRepo().find({ where: { userId: ghostSeller.id, roleType: AccountRoleType.SELLER } });
    expect(sellerRoles).toHaveLength(0);
  });

  it('skips (does not write) a target whose Buyer side is no longer deterministic (e.g. buyer role since deactivated)', async () => {
    if (!reachable) return;
    const { convo, buyerRole } = await seedConversation2Shape();
    await roleRepo().update(buyerRole.id, { status: AccountRoleStatus.SUSPENDED as any });
    const code = await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await participantRepo().count()).toBe(0);
  });

  it('skips (does not write) a target that is no longer AMBIGUOUS (situation changed since authorization)', async () => {
    if (!reachable) return;
    const { convo } = await seedConversation2Shape();
    await convoRepo().update(convo.id, { classificationStatus: ConversationClassificationStatus.RESOLVED });
    const code = await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await participantRepo().count()).toBe(0);
  });

  it('reports already-present without duplicating when the canonical participant already exists (production conversation 2\'s actual state)', async () => {
    if (!reachable) return;
    const { convo, buyerRole } = await seedConversation2Shape();
    await participantRepo().save(participantRepo().create({ conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.BUYER, status: ParticipantStatus.ACTIVE, permissions: {} } as any));
    const code = await main(['--execute', '--conversation-ids', String(convo.id), '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await participantRepo().count({ where: { conversationId: convo.id } })).toBe(1);
  });

  it('processes multiple targets independently -- one non-deterministic target does not block the others', async () => {
    if (!reachable) return;
    const good = await seedConversation2Shape();
    const bad = await seedConversation2Shape();
    await roleRepo().update(bad.buyerRole.id, { status: AccountRoleStatus.SUSPENDED as any });

    const code = await main(['--execute', '--conversation-ids', `${good.convo.id},${bad.convo.id}`, '--confirm-production-participant-completion', REQUIRED_CONFIRMATION_TOKEN], dataSource);

    expect(code).toBe(0);
    expect(await participantRepo().count({ where: { conversationId: good.convo.id } })).toBe(1);
    expect(await participantRepo().count({ where: { conversationId: bad.convo.id } })).toBe(0);
  });

  it('the DataSource it builds itself always closes', async () => {
    if (!reachable) return;
    const prevEnv = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USERNAME, pass: process.env.DB_PASSWORD, name: process.env.DB_NAME };
    process.env.DB_HOST = DB_HOST; process.env.DB_PORT = String(DB_PORT); process.env.DB_USERNAME = DB_USERNAME; process.env.DB_PASSWORD = DB_PASSWORD; process.env.DB_NAME = TEST_DB_NAME;
    try {
      const { convo } = await seedConversation2Shape();
      const code = await main(['--conversation-ids', String(convo.id)]);
      expect(code).toBe(0);
    } finally {
      process.env.DB_HOST = prevEnv.host; process.env.DB_PORT = prevEnv.port; process.env.DB_USERNAME = prevEnv.user; process.env.DB_PASSWORD = prevEnv.pass; process.env.DB_NAME = prevEnv.name;
    }
  });
});
