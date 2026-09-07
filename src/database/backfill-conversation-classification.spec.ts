import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { parseArgs, main, REQUIRED_CONFIRMATION_TOKEN } from './backfill-conversation-classification';
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
const CONFIRM = ['--confirm-production-backfill', REQUIRED_CONFIRMATION_TOKEN];

describe('backfill-conversation-classification CLI — parseArgs (pure, no DB)', () => {
  it('defaults to dry-run (execute=false) when --execute is absent', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('rejects --offset entirely -- offset is structurally fixed at 0, not a CLI-configurable value', () => {
    expect(() => parseArgs(['--offset', '5'])).toThrow(/--offset is not a supported flag/);
    expect(() => parseArgs(['--offset=5'])).toThrow(/--offset is not a supported flag/);
  });

  it('parses --batch-size and --expect-* with the reviewed defaults (7/1/5) for dry-run when omitted', () => {
    const opts = parseArgs([]);
    expect(opts.batchSize).toBe(50);
    expect(opts.expectResolved).toBe(7);
    expect(opts.expectExternal).toBe(1);
    expect(opts.expectAmbiguous).toBe(5);
  });

  it('parses explicit --batch-size / --expect-* overrides for dry-run', () => {
    const opts = parseArgs(['--batch-size', '20', '--expect-resolved', '3', '--expect-external=2', '--expect-ambiguous', '1']);
    expect(opts.batchSize).toBe(20);
    expect(opts.expectResolved).toBe(3);
    expect(opts.expectExternal).toBe(2);
    expect(opts.expectAmbiguous).toBe(1);
  });

  describe('--execute safeguards', () => {
    it('--execute without any --expect-* flags fails before anything else is checked', () => {
      expect(() => parseArgs(['--execute', ...CONFIRM])).toThrow(/requires explicit --expect-resolved, --expect-external, and --expect-ambiguous/);
    });

    it('--execute with only SOME --expect-* flags still fails (all three required)', () => {
      expect(() => parseArgs(['--execute', '--expect-resolved', '7', ...CONFIRM])).toThrow(/requires explicit --expect-resolved, --expect-external, and --expect-ambiguous/);
    });

    it('--execute with all --expect-* but no confirmation token fails', () => {
      expect(() => parseArgs(['--execute', '--expect-resolved', '7', '--expect-external', '1', '--expect-ambiguous', '5'])).toThrow(/requires --confirm-production-backfill/);
    });

    it('--execute with all --expect-* and the WRONG confirmation token fails', () => {
      expect(() => parseArgs(['--execute', '--expect-resolved', '7', '--expect-external', '1', '--expect-ambiguous', '5', '--confirm-production-backfill', 'WRONG-TOKEN'])).toThrow(/requires --confirm-production-backfill/);
    });

    it('--execute with all --expect-* explicit AND the correct confirmation token succeeds in parsing', () => {
      const opts = parseArgs(['--execute', '--expect-resolved', '7', '--expect-external', '1', '--expect-ambiguous', '5', ...CONFIRM]);
      expect(opts.execute).toBe(true);
      expect(opts.expectResolved).toBe(7);
      expect(opts.expectExternal).toBe(1);
      expect(opts.expectAmbiguous).toBe(5);
      expect(opts.confirmToken).toBe(REQUIRED_CONFIRMATION_TOKEN);
    });

    it('dry-run (no --execute) never requires --expect-* or a confirmation token', () => {
      expect(() => parseArgs([])).not.toThrow();
      expect(() => parseArgs(['--batch-size', '10'])).not.toThrow();
    });
  });

  describe('strict integer parsing (--expect-*)', () => {
    for (const flagName of ['expect-resolved', 'expect-external', 'expect-ambiguous']) {
      it(`--${flagName} rejects NaN / non-numeric input`, () => {
        expect(() => parseArgs([`--${flagName}`, 'abc'])).toThrow(new RegExp(`--${flagName} must be a plain non-negative integer`));
      });

      it(`--${flagName} rejects a decimal value`, () => {
        expect(() => parseArgs([`--${flagName}`, '7.5'])).toThrow(new RegExp(`--${flagName} must be a plain non-negative integer`));
      });

      it(`--${flagName} rejects a partially-numeric value ("7abc")`, () => {
        expect(() => parseArgs([`--${flagName}`, '7abc'])).toThrow(new RegExp(`--${flagName} must be a plain non-negative integer`));
      });

      it(`--${flagName} rejects a negative value`, () => {
        expect(() => parseArgs([`--${flagName}`, '-5'])).toThrow(new RegExp(`--${flagName} must be a plain non-negative integer`));
      });

      it(`--${flagName} accepts 0 (a valid expectation count)`, () => {
        expect(() => parseArgs([`--${flagName}`, '0'])).not.toThrow();
      });

      it(`--${flagName} accepts a plain positive integer`, () => {
        expect(() => parseArgs([`--${flagName}`, '7'])).not.toThrow();
      });
    }
  });

  describe('strict positive integer parsing (--batch-size)', () => {
    it('rejects NaN / non-numeric input', () => {
      expect(() => parseArgs(['--batch-size', 'abc'])).toThrow(/--batch-size must be a plain non-negative integer/);
    });

    it('rejects a decimal value', () => {
      expect(() => parseArgs(['--batch-size', '20.5'])).toThrow(/--batch-size must be a plain non-negative integer/);
    });

    it('rejects a partially-numeric value', () => {
      expect(() => parseArgs(['--batch-size', '20x'])).toThrow(/--batch-size must be a plain non-negative integer/);
    });

    it('rejects a negative value', () => {
      expect(() => parseArgs(['--batch-size', '-1'])).toThrow(/--batch-size must be a plain non-negative integer/);
    });

    it('rejects zero -- batch size must be strictly positive, unlike the --expect-* counts', () => {
      expect(() => parseArgs(['--batch-size', '0'])).toThrow(/--batch-size must be greater than 0/);
    });

    it('accepts a plain positive integer', () => {
      const opts = parseArgs(['--batch-size', '20']);
      expect(opts.batchSize).toBe(20);
    });

    it('defaults to 50 when omitted', () => {
      expect(parseArgs([]).batchSize).toBe(50);
    });
  });

  describe('unknown / duplicate argument rejection', () => {
    it('rejects a completely unrecognized flag', () => {
      expect(() => parseArgs(['--YOLO'])).toThrow(/Unknown argument: --YOLO/);
    });

    it('rejects an unrecognized flag even when it looks plausible (typo of a real flag)', () => {
      expect(() => parseArgs(['--exept-resolved', '7'])).toThrow(/Unknown argument: --exept-resolved/);
    });

    it('rejects an unrecognized flag given in --name=value form', () => {
      expect(() => parseArgs(['--YOLO=1'])).toThrow(/Unknown argument: --YOLO/);
    });

    it('rejects a duplicate recognized flag (space form)', () => {
      expect(() => parseArgs(['--expect-resolved', '3', '--expect-resolved', '7'])).toThrow(/Duplicate argument: --expect-resolved/);
    });

    it('rejects a duplicate recognized flag (mixed = and space form)', () => {
      expect(() => parseArgs(['--batch-size=10', '--batch-size', '20'])).toThrow(/Duplicate argument: --batch-size/);
    });

    it('rejects a duplicate --execute', () => {
      expect(() => parseArgs(['--execute', '--execute', ...CONFIRM, '--expect-resolved', '7', '--expect-external', '1', '--expect-ambiguous', '5'])).toThrow(/Duplicate argument: --execute/);
    });

    it('a genuinely unique, fully-valid argument set still parses successfully (sanity check that the new checks are not over-broad)', () => {
      expect(() => parseArgs(['--execute', '--batch-size', '20', '--expect-resolved', '7', '--expect-external', '1', '--expect-ambiguous', '5', ...CONFIRM])).not.toThrow();
    });

    it('bare numeric VALUES following a flag are never mistaken for unknown flags', () => {
      // "20" does not start with "--" so it must never trip the
      // unknown-argument scanner, even though it immediately follows a
      // recognized flag.
      expect(() => parseArgs(['--batch-size', '20'])).not.toThrow();
    });
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

  it('the confirmation token is a literal string, never derived from a database URL/credential', () => {
    expect(REQUIRED_CONFIRMATION_TOKEN).not.toMatch(/postgres|password|DB_|\/\//i);
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

  const userRepo = () => dataSource.getRepository(User);
  const roleRepo = () => dataSource.getRepository(AccountRole);
  const customerRepo = () => dataSource.getRepository(BusinessCustomer);
  const convoRepo = () => dataSource.getRepository(Conversation);
  const participantRepo = () => dataSource.getRepository(ConversationParticipant);

  const makeUser = async (tag: string) => {
    const n = ++seq;
    return userRepo().save(userRepo().create({
      email: `${tag}${n}@cli-test.local`, phone: `+2557${String(n).padStart(8, '0')}`, password: 'x', name: tag,
    } as any));
  };

  const makeSellerRole = async (userId: number) => roleRepo().save(roleRepo().create({
    userId, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: ++seq,
  } as any));

  const makeBuyerRole = async (userId: number) => roleRepo().save(roleRepo().create({
    userId, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: userId,
  } as any));

  const makeCustomer = async (sellerId: number, userId: number | null, name: string) => customerRepo().save(customerRepo().create({
    sellerId, userId, name, channel: 'kentexa',
  } as any));

  const makeConvo = async (sellerId: number, customerId: number) => convoRepo().save(convoRepo().create({
    sellerId, customerId, classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED,
  } as any));

  const plantParticipant = async (conversationId: number, opts: Partial<ConversationParticipant> & { participantKind: string; principalType: string }) =>
    participantRepo().save(participantRepo().create({
      conversationId, status: ParticipantStatus.ACTIVE, permissions: {}, ...opts,
    } as any));

  /** Full RESOLVED shape: real seller + buyer, both independently resolvable. */
  const seedResolvedConversation = async () => {
    const seller = await makeUser('S');
    const buyer = await makeUser('B');
    const sellerRole = await makeSellerRole(seller.id);
    const buyerRole = await makeBuyerRole(buyer.id);
    const customer = await makeCustomer(seller.id, buyer.id, 'B');
    const convo = await makeConvo(seller.id, customer.id);
    return { convo, seller, buyer, sellerRole, buyerRole, customer };
  };

  /** EXTERNAL_CONTACT shape: real seller, customer with no linked user account. */
  const seedExternalContactConversation = async () => {
    const seller = await makeUser('ES');
    const sellerRole = await makeSellerRole(seller.id);
    const customer = await makeCustomer(seller.id, null, 'Manual Contact');
    const convo = await makeConvo(seller.id, customer.id);
    return { convo, seller, sellerRole, customer };
  };

  /**
   * Conversation-2-equivalent AMBIGUOUS shape: seller with NO AccountRole
   * at all, but a real buyer with an independently resolvable active Buyer
   * AccountRole -- the exact production shape this whole review concerns.
   */
  const seedAmbiguousWithResolvableBuyer = async () => {
    const ghostSeller = await makeUser('GhostSeller'); // deliberately: no seller role ever created
    const buyer = await makeUser('RealBuyer');
    const buyerRole = await makeBuyerRole(buyer.id);
    const customer = await makeCustomer(ghostSeller.id, buyer.id, 'RealBuyer');
    const convo = await makeConvo(ghostSeller.id, customer.id);
    return { convo, ghostSeller, buyer, buyerRole, customer };
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

  const execArgs = (extra: string[]) => ['--execute', ...extra, ...CONFIRM];

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
    const reloaded = await convoRepo().findOne({ where: { id: convo.id } });
    expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.LEGACY_UNSCOPED); // untouched
    expect(await participantRepo().count()).toBe(0);
  }, 30000);

  it('absence of --execute cannot mutate -- identical seed, run WITHOUT --execute leaves everything untouched', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);
    expect(await participantRepo().count()).toBe(0);
  }, 30000);

  it('execute without explicit --expect-* flags fails before opening a mutation path', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    const code = await main(['--execute', '--batch-size', '10', ...CONFIRM], dataSource);
    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(0);
  }, 30000);

  it('execute without the confirmation token fails even with correct --expect-* flags', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);
    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(0);
  }, 30000);

  it('execute with the WRONG confirmation token fails', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    const code = await main(['--execute', '--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0', '--confirm-production-backfill', 'not-the-right-token'], dataSource);
    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(0);
  }, 30000);

  it('correct explicit --expect-* AND correct confirmation token together reach execution only after every invariant passes', async () => {
    if (!reachable) return;
    const { convo, sellerRole, buyerRole } = await seedResolvedConversation();

    const code = await main(execArgs(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0']), dataSource);

    expect(code).toBe(0);
    const reloaded = await convoRepo().findOne({ where: { id: convo.id } });
    expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.RESOLVED);
    const participants = await participantRepo().find({ where: { conversationId: convo.id } });
    expect(participants.map((p) => p.accountRoleId).sort()).toEqual([sellerRole.id, buyerRole.id].sort());
  }, 30000);

  it('rejects a --batch-size smaller than the live LEGACY_UNSCOPED count, before any write', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    await seedResolvedConversation(); // 2 LEGACY_UNSCOPED rows now exist

    const code = await main(execArgs(['--batch-size', '1', '--expect-resolved', '2', '--expect-external', '0', '--expect-ambiguous', '0']), dataSource);

    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(0); // rejected before the pre-write gate ever ran
  }, 30000);

  it('rejects when the actual classification distribution does not match --expect-*, before any write', async () => {
    if (!reachable) return;
    await seedResolvedConversation(); // this will classify as RESOLVED, not AMBIGUOUS

    const code = await main(execArgs(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1']), dataSource);

    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(0);
  }, 30000);

  it('rejects when an existing active participant does not independently match ANY resolvable side (unexpected participant), before any write', async () => {
    if (!reachable) return;
    const { convo } = await seedResolvedConversation();
    // A real, unrelated third-party user's own (unrelated) SELLER role --
    // does not belong to this conversation's seller or buyer side at all.
    const unrelatedUser = await makeUser('Unrelated');
    const bogusRole = await makeSellerRole(unrelatedUser.id);
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: bogusRole.id, participantKind: ParticipantKind.SELLER });

    const code = await main(execArgs(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0']), dataSource);

    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(1); // no NEW writes beyond the bogus row we planted
  }, 30000);

  describe('participant-level canonicality on AMBIGUOUS conversations (Ambiguous Partial-Participant Semantics Review)', () => {
    it('conversation-2-equivalent shape: a correct partial Buyer AccountRole participant on an AMBIGUOUS conversation is ACCEPTED, and the gate still passes', async () => {
      const { convo, buyerRole } = await seedAmbiguousWithResolvableBuyer();
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.BUYER });

      const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1'], dataSource);

      expect(code).toBe(0); // dry-run gate passes -- the partial participant is canonical for its side
      const reloaded = await convoRepo().findOne({ where: { id: convo.id } });
      expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.LEGACY_UNSCOPED); // dry-run: untouched
    });

    it('the SAME conversation with the WRONG Buyer AccountRole fails -- a participant is not automatically trusted merely because it exists', async () => {
      const { convo } = await seedAmbiguousWithResolvableBuyer();
      const someoneElse = await makeUser('SomeoneElse');
      const wrongBuyerRole = await makeBuyerRole(someoneElse.id); // a real, active buyer role -- just not THIS conversation's buyer
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: wrongBuyerRole.id, participantKind: ParticipantKind.BUYER });

      const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1'], dataSource);

      expect(code).toBe(1);
    });

    it('a Seller participant on conversation 2\'s shape fails, because the seller side cannot independently resolve -- the unresolved side must never be treated as trusted', async () => {
      const { convo, buyerRole } = await seedAmbiguousWithResolvableBuyer();
      // Fabricate a "seller" participant using the BUYER's own account role
      // id (the only real active AccountRole in this fixture) -- there is
      // no real seller AccountRole to reference, which is exactly the point:
      // any seller-kind participant here is necessarily wrong.
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.SELLER });

      const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1'], dataSource);

      expect(code).toBe(1);
    });

    it('an unknown/unsupported principalType (workspace) fails closed, even though it satisfies the DB\'s own CHECK constraint on its own', async () => {
      const { convo } = await seedAmbiguousWithResolvableBuyer();
      // A structurally valid `workspace` principal (satisfies
      // CHK_conv_participant_one_principal on its own) -- but the current
      // classifier model neither produces nor validates workspace
      // participants at all, so the gate must fail closed rather than
      // silently accept an unrecognized shape.
      await plantParticipant(convo.id, {
        principalType: ParticipantPrincipalType.WORKSPACE,
        workspaceType: 'seller_profile', workspaceId: 1,
        participantKind: ParticipantKind.SELLER,
      } as any);

      const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1'], dataSource);

      expect(code).toBe(1);
    });

    it('a wrong external-contact participant on an EXTERNAL_CONTACT-shaped conversation fails', async () => {
      const { convo } = await seedExternalContactConversation();
      const otherSeller = await makeUser('OtherSeller');
      const otherCustomer = await makeCustomer(otherSeller.id, null, 'Different Contact'); // a real external contact, just the WRONG one

      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.EXTERNAL_CONTACT, externalCustomerId: otherCustomer.id, participantKind: ParticipantKind.EXTERNAL });

      const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '1', '--expect-ambiguous', '0'], dataSource);

      expect(code).toBe(1);
    });

    it('regression: an EXTERNAL_CONTACT participant with the CORRECT externalCustomerId but the WRONG participantKind fails -- matching the canonical customer id alone is not sufficient, the claimed side/kind must also be correct', async () => {
      const { convo, customer } = await seedExternalContactConversation();
      // The externalCustomerId is exactly right; participantKind is not
      // 'external' -- this must still be rejected. This is the exact shape
      // that was previously (incorrectly) accepted before this fix.
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.EXTERNAL_CONTACT, externalCustomerId: customer.id, participantKind: ParticipantKind.SELLER });

      const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '1', '--expect-ambiguous', '0'], dataSource);

      expect(code).toBe(1);
    });

    it('cross-combination: Buyer AR with participantKind=seller fails (correct role id, wrong claimed side)', async () => {
      const { convo, buyerRole } = await seedResolvedConversation();
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.SELLER });

      const code = await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

      expect(code).toBe(1);
    });

    it('cross-combination: Seller AR with participantKind=buyer fails (correct role id, wrong claimed side)', async () => {
      const { convo, sellerRole } = await seedResolvedConversation();
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: sellerRole.id, participantKind: ParticipantKind.BUYER });

      const code = await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

      expect(code).toBe(1);
    });

    it('a wrong Seller AccountRole on an otherwise-RESOLVED conversation fails', async () => {
      const { convo, buyerRole } = await seedResolvedConversation();
      const wrongSellerUser = await makeUser('WrongSeller');
      const wrongSellerRole = await makeSellerRole(wrongSellerUser.id);
      // Overwrite: plant an extra, WRONG seller participant alongside the correct buyer.
      await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: wrongSellerRole.id, participantKind: ParticipantKind.SELLER });
      void buyerRole;

      const code = await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

      expect(code).toBe(1);
    });
  });

  it('RESOLVED conversations\' existing canonical participants continue to validate correctly (no regression)', async () => {
    if (!reachable) return;
    const { convo, sellerRole, buyerRole } = await seedResolvedConversation();
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: sellerRole.id, participantKind: ParticipantKind.SELLER });
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.BUYER });

    const code = await main(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(0);
  }, 30000);

  it('EXTERNAL_CONTACT conversations\' existing canonical participants continue to validate correctly (no regression)', async () => {
    if (!reachable) return;
    const { convo, sellerRole, customer } = await seedExternalContactConversation();
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: sellerRole.id, participantKind: ParticipantKind.SELLER });
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.EXTERNAL_CONTACT, externalCustomerId: customer.id, participantKind: ParticipantKind.EXTERNAL });

    const code = await main(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '1', '--expect-ambiguous', '0'], dataSource);

    expect(code).toBe(0);
  }, 30000);

  it('the AMBIGUOUS write path still creates ZERO participants during --execute, even with an accepted partial Buyer participant already present', async () => {
    if (!reachable) return;
    const { convo, buyerRole } = await seedAmbiguousWithResolvableBuyer();
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.BUYER });

    const code = await main(execArgs(['--batch-size', '10', '--expect-resolved', '0', '--expect-external', '0', '--expect-ambiguous', '1']), dataSource);

    expect(code).toBe(0);
    const reloaded = await convoRepo().findOne({ where: { id: convo.id } });
    expect(reloaded?.classificationStatus).toBe(ConversationClassificationStatus.AMBIGUOUS); // status/reason only
    const participants = await participantRepo().find({ where: { conversationId: convo.id } });
    expect(participants).toHaveLength(1); // still exactly the one pre-existing Buyer row -- no Seller was synthesized
    expect(participants[0].participantKind).toBe(ParticipantKind.BUYER);
  }, 30000);

  it('accepts a canonical pre-existing participant (does NOT require participant count == 0) and only creates the missing counterpart', async () => {
    if (!reachable) return;
    const { convo, sellerRole, buyerRole } = await seedResolvedConversation();
    // Pre-create ONLY the buyer participant, mirroring the real production
    // "participant #1" situation this hardening was built to accommodate.
    await plantParticipant(convo.id, { principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, participantKind: ParticipantKind.BUYER });

    const code = await main(execArgs(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0']), dataSource);

    expect(code).toBe(0);
    const participants = await participantRepo().find({ where: { conversationId: convo.id } });
    expect(participants).toHaveLength(2); // the pre-existing buyer row + the newly-created seller row
    expect(participants.map((p) => p.accountRoleId).sort()).toEqual([sellerRole.id, buyerRole.id].sort());
  }, 30000);

  it('rejects on a migration-ledger prerequisite failure, before any write', async () => {
    if (!reachable) return;
    await seedResolvedConversation();
    await dataSource.query('delete from typeorm_migrations'); // simulate an unmigrated/mismatched database

    const code = await main(execArgs(['--batch-size', '10', '--expect-resolved', '1', '--expect-external', '0', '--expect-ambiguous', '0']), dataSource);

    expect(code).toBe(1);
    expect(await participantRepo().count()).toBe(0);
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
