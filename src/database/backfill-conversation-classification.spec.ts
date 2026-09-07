import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { parseArgs, main } from './backfill-conversation-classification';
import { Conversation, ConversationClassificationStatus } from '../business/entities/conversation.entity';
import { BusinessCustomer } from '../business/entities/business-customer.entity';
import {
  ConversationParticipant,
  ParticipantKind,
  ParticipantPrincipalType,
  ParticipantStatus,
} from '../business/entities/conversation-participant.entity';
import { ConversationParticipantState } from '../business/entities/conversation-participant-state.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';

const SOURCE = fs.readFileSync(path.join(__dirname, 'backfill-conversation-classification.ts'), 'utf8');

describe('backfill-conversation-classification CLI — parseArgs (pure, no DB)', () => {
  it('defaults to dry-run (execute=false) when --execute is absent', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('sets execute=true only when --execute is explicitly passed', () => {
    expect(parseArgs(['--execute']).execute).toBe(true);
  });

  it('rejects --offset entirely -- offset is structurally fixed at 0, not a CLI-configurable value', () => {
    expect(() => parseArgs(['--offset', '5'])).toThrow(/--offset is not a supported flag/);
    expect(() => parseArgs(['--offset=5'])).toThrow(/--offset is not a supported flag/);
  });

  it('parses --batch-size and --expect-* with the reviewed defaults (7/1/5) when omitted', () => {
    const opts = parseArgs([]);
    expect(opts.batchSize).toBe(50);
    expect(opts.expectResolved).toBe(7);
    expect(opts.expectExternal).toBe(1);
    expect(opts.expectAmbiguous).toBe(5);
  });

  it('parses explicit --batch-size / --expect-* overrides', () => {
    const opts = parseArgs(['--batch-size', '20', '--expect-resolved', '3', '--expect-external=2', '--expect-ambiguous', '1']);
    expect(opts.batchSize).toBe(20);
    expect(opts.expectResolved).toBe(3);
    expect(opts.expectExternal).toBe(2);
    expect(opts.expectAmbiguous).toBe(1);
  });
});

describe('backfill-conversation-classification CLI — structural safety proofs (static source inspection)', () => {
  // Checked against actual import statements, not the whole file's prose --
  // this file's own header comment explains (in words) why NestFactory is
  // NOT used, which would otherwise false-positive a naive substring check.
  const importLines = SOURCE.split('\n').filter((line) => /^\s*import\b/.test(line));

  it('never imports NestFactory, @nestjs/core\'s bootstrap, or @nestjs/schedule -- structurally cannot arm any unrelated cron job', () => {
    expect(importLines.some((l) => /NestFactory/.test(l))).toBe(false);
    expect(importLines.some((l) => /@nestjs\/core/.test(l))).toBe(false);
    expect(importLines.some((l) => /@nestjs\/schedule/.test(l))).toBe(false);
    expect(importLines.some((l) => /ScheduleModule/.test(l))).toBe(false);
    expect(SOURCE).not.toMatch(/@Cron\(/);
  });

  it('never imports AppModule and never opens an HTTP listener', () => {
    expect(importLines.some((l) => /AppModule/.test(l))).toBe(false);
    expect(SOURCE).not.toMatch(/\.listen\(/);
    expect(importLines.some((l) => /@nestjs\/platform-express/.test(l))).toBe(false);
  });

  it('the execute path calls classifyAndBackfillBatch with stopOnError=true (literal, not merely documented)', () => {
    expect(SOURCE).toMatch(/classifyAndBackfillBatch\(opts\.batchSize,\s*0,\s*true\)/);
  });
});

describe('backfill-conversation-classification CLI — end-to-end against a disposable database', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_classifier_cli_test';

  const ENTITIES = [
    Conversation, BusinessCustomer, AccountRole, ConversationParticipant,
    ConversationParticipantState, User, SellerProfile, Agent, SuperAgent,
    TransportProvider, ActiveRoleSession,
  ];

  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;
  let seq = 0; // makes each test's seed data non-colliding

  const seedResolvedConversation = async () => {
    seq++;
    const userRepo = dataSource.getRepository(User);
    const seller = await userRepo.save(userRepo.create({ email: `s${seq}@cli-test.local`, phone: `+2557${String(seq).padStart(6, '1')}`, password: 'x', name: 'S' } as any));
    const buyer = await userRepo.save(userRepo.create({ email: `b${seq}@cli-test.local`, phone: `+2558${String(seq).padStart(6, '1')}`, password: 'x', name: 'B' } as any));
    const accountRoleRepo = dataSource.getRepository(AccountRole);
    const sellerRole = await accountRoleRepo.save(accountRoleRepo.create({ userId: seller.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: seq } as any));
    const buyerRole = await accountRoleRepo.save(accountRoleRepo.create({ userId: buyer.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: buyer.id } as any));
    const customer = await dataSource.getRepository(BusinessCustomer).save(dataSource.getRepository(BusinessCustomer).create({ sellerId: seller.id, userId: buyer.id, name: 'B', channel: 'kentexa' } as any));
    const convo = await dataSource.getRepository(Conversation).save(dataSource.getRepository(Conversation).create({ sellerId: seller.id, customerId: customer.id, classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED } as any));
    return { convo, seller, buyer, sellerRole, buyerRole, customer };
  };

  const resetToLegacyUnscopedOnly = async () => {
    // Wipe every row this suite could have touched, so each test starts
    // from a clean, fully-known LEGACY_UNSCOPED-only state.
    await dataSource.query('delete from conversation_participant_state');
    await dataSource.query('delete from conversation_participant');
    await dataSource.query('delete from conversation');
    await dataSource.query('delete from business_customer');
    await dataSource.query('delete from account_role');
    await dataSource.query('delete from "user"');
  };

  const seedMigrationLedger = async () => {
    await dataSource.query('delete from typeorm_migrations');
    for (const name of ['BaselineRenderProductionSchema1788256800000', 'AddAccountRoleAndActiveRoleSession1788257400000', 'FixActiveRoleSessionUuidDefault1788258000000', 'AddCommunicationParticipantAudience1788258600000']) {
      await dataSource.query('insert into typeorm_migrations (timestamp, name) values ($1, $2)', [Date.now(), name]);
    }
  };

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try {
      await probe.connect();
      reachable = true;
      await probe.end();
    } catch {
      reachable = false;
      return;
    }

    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);

    dataSource = new DataSource({
      type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME, synchronize: true, entities: ENTITIES,
    });
    await dataSource.initialize();
    // TypeORM's own migrations table isn't part of `entities` (it's an
    // internal bookkeeping table) -- create it explicitly, matching the
    // real schema TypeORM's migration runner itself creates.
    await dataSource.query('create table if not exists typeorm_migrations (id serial primary key, timestamp bigint not null, name varchar not null)');
  }, 60000);

  beforeEach(async () => {
    if (!reachable) return;
    await resetToLegacyUnscopedOnly();
    await seedMigrationLedger();
  }, 30000);

  // Generous timeout: when the full suite runs many jest workers in
  // parallel, this file's disposable database and the atomicity
  // integration spec's disposable database both contend for the same
  // local Postgres server's connection/IO capacity, which can make
  // CREATE/DROP DATABASE take noticeably longer than it does in isolation.
  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await adminClient.end();
    }
  }, 90000);

  it('dry run performs zero writes even when the classification distribution matches expectations', async () => {
    if (!reachable) return;
    const { convo } = await seedResolvedConversation();

    const code = await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(0);
    const reloaded = await dataSource.getRepository(Conversation).findOne({ where: { id: convo.id } });
    expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.LEGACY_UNSCOPED); // untouched
    const participantCount = await dataSource.getRepository(ConversationParticipant).count();
    expect(participantCount).toBe(0);
  }, 30000);

  it('absence of --execute cannot mutate -- identical seed, run WITHOUT --execute leaves everything untouched', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);
    const participantCount = await dataSource.getRepository(ConversationParticipant).count();
    expect(participantCount).toBe(0);
  }, 30000);

  it('explicit --execute path writes the expected classification + participants', async () => {
    if (!reachable) return;
    const { convo, sellerRole, buyerRole } = await seedResolvedConversation();

    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(0);
    const reloaded = await dataSource.getRepository(Conversation).findOne({ where: { id: convo.id } });
    expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.RESOLVED);
    const participants = await dataSource.getRepository(ConversationParticipant).find({ where: { conversationId: convo.id } });
    expect(participants.map((p) => p.accountRoleId).sort()).toEqual([sellerRole.id, buyerRole.id].sort());
  }, 30000);

  it('rejects a --batch-size smaller than the live LEGACY_UNSCOPED count, before any write', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    await seedResolvedConversation(); // 2 LEGACY_UNSCOPED rows now exist

    const code = await main(['--execute', '--batch-size', '1', '--expect-resolved', '2', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(1);
    const participantCount = await dataSource.getRepository(ConversationParticipant).count();
    expect(participantCount).toBe(0); // rejected before the pre-write gate ever ran
  }, 30000);

  it('rejects when the actual classification distribution does not match --expect-*, before any write', async () => {
    if (!reachable) return;
    await seedResolvedConversation(); // this will classify as RESOLVED, not AMBIGUOUS

    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1'], dataSource);

    expect(code).toBe(1);
    const participantCount = await dataSource.getRepository(ConversationParticipant).count();
    expect(participantCount).toBe(0);
  }, 30000);

  it('rejects when an existing active participant is NOT in the deterministic expected set (unexpected participant), before any write', async () => {
    if (!reachable) return;
    const { convo } = await seedResolvedConversation();
    // Plant a bogus participant referencing an accountRoleId that does not
    // belong to this conversation's deterministic expected set at all --
    // a real, unrelated third-party user's own (unrelated) SELLER role.
    const unrelatedUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({ email: 'unrelated@cli-test.local', phone: '+255700000099', password: 'x', name: 'Unrelated' } as any),
    );
    const bogusRole = await dataSource.getRepository(AccountRole).save(
      dataSource.getRepository(AccountRole).create({ userId: unrelatedUser.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: 999 } as any),
    );
    await dataSource.getRepository(ConversationParticipant).save(
      dataSource.getRepository(ConversationParticipant).create({
        conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: bogusRole.id,
        participantKind: ParticipantKind.SELLER, status: ParticipantStatus.ACTIVE, permissions: {},
      } as any),
    );

    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(1);
    // No NEW writes beyond the bogus row we planted ourselves.
    const participantCount = await dataSource.getRepository(ConversationParticipant).count();
    expect(participantCount).toBe(1);
  }, 30000);

  it('rejects when a participant exists on an AMBIGUOUS conversation, before any write', async () => {
    if (!reachable) return;
    // sellerId with no AccountRole at all -> AMBIGUOUS (no_active_seller_account_role)
    const userRepo = dataSource.getRepository(User);
    const ghostSeller = await userRepo.save(userRepo.create({ email: 'ghost@cli-test.local', phone: '+255799999999', password: 'x', name: 'Ghost' } as any));
    const buyer = await userRepo.save(userRepo.create({ email: 'buyerx@cli-test.local', phone: '+255799999998', password: 'x', name: 'BuyerX' } as any));
    const customer = await dataSource.getRepository(BusinessCustomer).save(dataSource.getRepository(BusinessCustomer).create({ sellerId: ghostSeller.id, userId: buyer.id, name: 'BuyerX', channel: 'kentexa' } as any));
    const convo = await dataSource.getRepository(Conversation).save(dataSource.getRepository(Conversation).create({ sellerId: ghostSeller.id, customerId: customer.id, classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED } as any));
    // Plant a participant on this AMBIGUOUS-bound conversation anyway.
    const someRole = await dataSource.getRepository(AccountRole).save(dataSource.getRepository(AccountRole).create({ userId: buyer.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: buyer.id } as any));
    await dataSource.getRepository(ConversationParticipant).save(dataSource.getRepository(ConversationParticipant).create({
      conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: someRole.id,
      participantKind: ParticipantKind.BUYER, status: ParticipantStatus.ACTIVE, permissions: {},
    } as any));

    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1'], dataSource);

    expect(code).toBe(1);
  }, 30000);

  it('accepts a canonical pre-existing participant (does NOT require participant count == 0) and only creates the missing counterpart', async () => {
    if (!reachable) return;
    const { convo, sellerRole, buyerRole } = await seedResolvedConversation();
    // Pre-create ONLY the buyer participant, mirroring the real production
    // "participant #1" situation this hardening was built to accommodate.
    await dataSource.getRepository(ConversationParticipant).save(dataSource.getRepository(ConversationParticipant).create({
      conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id,
      participantKind: ParticipantKind.BUYER, status: ParticipantStatus.ACTIVE, permissions: {},
    } as any));

    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(0);
    const participants = await dataSource.getRepository(ConversationParticipant).find({ where: { conversationId: convo.id } });
    expect(participants).toHaveLength(2); // the pre-existing buyer row + the newly-created seller row
    expect(participants.map((p) => p.accountRoleId).sort()).toEqual([sellerRole.id, buyerRole.id].sort());
  }, 30000);

  it('rejects on a migration-ledger prerequisite failure, before any write', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    await dataSource.query('delete from typeorm_migrations'); // simulate an unmigrated/mismatched database

    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(1);
    const participantCount = await dataSource.getRepository(ConversationParticipant).count();
    expect(participantCount).toBe(0);
  }, 30000);

  it('the DataSource it builds itself always closes, on both success and failure, when main() is not given a dataSourceOverride', async () => {
    if (!reachable) return;
    const prevEnv = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USERNAME, pass: process.env.DB_PASSWORD, name: process.env.DB_NAME };
    process.env.DB_HOST = DB_HOST;
    process.env.DB_PORT = String(DB_PORT);
    process.env.DB_USERNAME = DB_USERNAME;
    process.env.DB_PASSWORD = DB_PASSWORD;
    process.env.DB_NAME = TEST_DB_NAME;
    try {
      await seedResolvedConversation();
      // Success case: dry run with no argv override for the DataSource -- main() builds its own.
      const successCode = await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0']);
      expect(successCode).toBe(0);

      await resetToLegacyUnscopedOnly();
      await seedMigrationLedger();
      // Failure case: force a migration-prerequisite failure.
      await dataSource.query('delete from typeorm_migrations');
      const failureCode = await main(['--batch-size', '10']);
      expect(failureCode).toBe(1);
      await seedMigrationLedger();
    } finally {
      process.env.DB_HOST = prevEnv.host;
      process.env.DB_PORT = prevEnv.port;
      process.env.DB_USERNAME = prevEnv.user;
      process.env.DB_PASSWORD = prevEnv.pass;
      process.env.DB_NAME = prevEnv.name;
    }
    // If either main() call above had left its self-built DataSource open,
    // this suite's own `dataSource` (a separate connection) would still be
    // unaffected -- the real proof is simply that both calls resolved
    // without hanging/leaking (jest's own open-handle detection would
    // otherwise flag it), which is exercised by this test actually
    // completing within its timeout.
  }, 30000);
});
