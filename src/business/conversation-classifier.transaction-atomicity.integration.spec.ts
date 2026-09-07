import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { Conversation, ConversationClassificationStatus } from './entities/conversation.entity';
import { BusinessCustomer } from './entities/business-customer.entity';
import {
  ConversationParticipant,
  ParticipantKind,
  ParticipantPrincipalType,
} from './entities/conversation-participant.entity';
import { ConversationParticipantState } from './entities/conversation-participant-state.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { ParticipantResolutionService } from './participant-resolution.service';
import { ConversationClassifierService } from './conversation-classifier.service';

/**
 * REAL Postgres-level proof of per-conversation transactional atomicity.
 * The unit tests in conversation-classifier.service.spec.ts prove the
 * APPLICATION-LEVEL guarantee against a mocked DataSource/EntityManager
 * (a thrown step aborts the callback immediately) -- they cannot prove
 * that an already-issued UPDATE actually rolls back at the database level.
 * This test proves exactly that, against a disposable, throwaway database
 * on the local Postgres server (never the shared dev "kentexa" database,
 * never production) -- created fresh in beforeAll and dropped in
 * afterAll.
 *
 * Skips itself (rather than failing the suite) if no local Postgres
 * server is reachable, since CI/other environments may not have one.
 */
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const TEST_DB_NAME = 'kentexa_classifier_txn_test';

const ENTITIES = [
  Conversation, BusinessCustomer, AccountRole, ConversationParticipant,
  ConversationParticipantState, User, SellerProfile, Agent, SuperAgent,
  TransportProvider, ActiveRoleSession,
];

async function isLocalPostgresReachable(): Promise<boolean> {
  const client = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/** Test-only fault injection: real writes for SELLER, throws before BUYER. */
class FailingAfterSellerParticipantResolutionService extends ParticipantResolutionService {
  async ensureAccountRoleParticipant(...args: Parameters<ParticipantResolutionService['ensureAccountRoleParticipant']>) {
    if (args[2] === ParticipantKind.BUYER) {
      throw new Error('injected failure: simulated crash after seller participant, before buyer participant');
    }
    return super.ensureAccountRoleParticipant(...args);
  }
}

describe('ConversationClassifierService — real Postgres per-conversation transaction atomicity', () => {
  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;

  beforeAll(async () => {
    reachable = await isLocalPostgresReachable();
    if (!reachable) return;

    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);

    dataSource = new DataSource({
      type: 'postgres',
      host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME,
      synchronize: true, // disposable database, schema built fresh for this test only
      entities: ENTITIES,
    });
    await dataSource.initialize();
  }, 60000);

  // Generous timeout: when the full suite runs many jest workers in
  // parallel, this file's disposable database and the CLI spec's
  // disposable database both contend for the same local Postgres
  // server's connection/IO capacity, which can make DROP DATABASE take
  // noticeably longer than it does in isolation.
  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await adminClient.end();
    }
  }, 90000);

  it('a failure after the classification-status update but before participant creation completes rolls back BOTH -- the conversation remains LEGACY_UNSCOPED and no partial participant survives', async () => {
    if (!reachable) {
      console.warn('SKIPPED: no local Postgres reachable at ' + DB_HOST + ':' + DB_PORT);
      return;
    }

    const userRepo = dataSource.getRepository(User);
    const seller = await userRepo.save(userRepo.create({ email: 'seller@txn-test.local', phone: '+255700000001', password: 'x', name: 'Seller' } as any));
    const buyer = await userRepo.save(userRepo.create({ email: 'buyer@txn-test.local', phone: '+255700000002', password: 'x', name: 'Buyer' } as any));

    const accountRoleRepo = dataSource.getRepository(AccountRole);
    await accountRoleRepo.save(accountRoleRepo.create({
      userId: seller.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: 1,
    } as any));
    await accountRoleRepo.save(accountRoleRepo.create({
      userId: buyer.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.USER, profileId: buyer.id,
    } as any));

    const customerRepo = dataSource.getRepository(BusinessCustomer);
    const customer = await customerRepo.save(customerRepo.create({
      sellerId: seller.id, userId: buyer.id, name: 'Buyer', channel: 'kentexa',
    } as any));

    const convoRepo = dataSource.getRepository(Conversation);
    const convo = await convoRepo.save(convoRepo.create({
      sellerId: seller.id, customerId: customer.id,
      classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED,
    } as any));

    const participants = new FailingAfterSellerParticipantResolutionService(
      dataSource.getRepository(ConversationParticipant),
      dataSource.getRepository(ConversationParticipantState),
    );
    const classifier = new ConversationClassifierService(
      convoRepo,
      customerRepo,
      accountRoleRepo,
      participants,
      dataSource,
    );

    const report = await classifier.classifyAndBackfillBatch(10, 0);

    // The batch-level report correctly counts the failure and does NOT
    // count this row as resolved.
    expect(report.errors).toBe(1);
    expect(report.resolved).toBe(0);

    // ── Real, independent, outside-any-transaction verification ────────────
    const reloadedConvo = await convoRepo.findOne({ where: { id: convo.id } });
    expect(reloadedConvo?.classificationStatus).toBe(ConversationClassificationStatus.LEGACY_UNSCOPED);
    expect(reloadedConvo?.classificationReason).toBeNull();
    expect(reloadedConvo?.classifiedAt).toBeNull();

    const participantRows = await dataSource.getRepository(ConversationParticipant).find({ where: { conversationId: convo.id } });
    expect(participantRows).toHaveLength(0); // the seller row that "succeeded" before the throw did NOT survive

    const participantStateRows = await dataSource.query(
      'select count(*)::int as c from conversation_participant_state',
    );
    expect(participantStateRows[0].c).toBe(0); // no orphaned state row either
  }, 30000);

  it('sanity check: the SAME setup without fault injection succeeds and commits both participants (proves the failure above was caused by the injected fault, not a setup problem)', async () => {
    if (!reachable) return;

    const userRepo = dataSource.getRepository(User);
    const seller = await userRepo.save(userRepo.create({ email: 'seller2@txn-test.local', phone: '+255700000003', password: 'x', name: 'Seller2' } as any));
    const buyer = await userRepo.save(userRepo.create({ email: 'buyer2@txn-test.local', phone: '+255700000004', password: 'x', name: 'Buyer2' } as any));

    const accountRoleRepo = dataSource.getRepository(AccountRole);
    const sellerRole = await accountRoleRepo.save(accountRoleRepo.create({
      userId: seller.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: 2,
    } as any));
    const buyerRole = await accountRoleRepo.save(accountRoleRepo.create({
      userId: buyer.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.USER, profileId: buyer.id,
    } as any));

    const customerRepo = dataSource.getRepository(BusinessCustomer);
    const customer = await customerRepo.save(customerRepo.create({
      sellerId: seller.id, userId: buyer.id, name: 'Buyer2', channel: 'kentexa',
    } as any));

    const convoRepo = dataSource.getRepository(Conversation);
    const convo = await convoRepo.save(convoRepo.create({
      sellerId: seller.id, customerId: customer.id,
      classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED,
    } as any));

    const participants = new ParticipantResolutionService(
      dataSource.getRepository(ConversationParticipant),
      dataSource.getRepository(ConversationParticipantState),
    );
    const classifier = new ConversationClassifierService(convoRepo, customerRepo, accountRoleRepo, participants, dataSource);

    const report = await classifier.classifyAndBackfillBatch(10, 0);
    expect(report.errors).toBe(0);
    expect(report.resolved).toBe(1);

    const reloadedConvo = await convoRepo.findOne({ where: { id: convo.id } });
    expect(reloadedConvo?.classificationStatus).toBe(ConversationClassificationStatus.RESOLVED);

    const participantRows = await dataSource.getRepository(ConversationParticipant).find({ where: { conversationId: convo.id } });
    expect(participantRows).toHaveLength(2);
    expect(participantRows.map((p) => p.accountRoleId).sort()).toEqual([sellerRole.id, buyerRole.id].sort());
    expect(participantRows.every((p) => p.principalType === ParticipantPrincipalType.ACCOUNT_ROLE)).toBe(true);
  }, 30000);
});
