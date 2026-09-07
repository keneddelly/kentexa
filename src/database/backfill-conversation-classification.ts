import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Conversation, ConversationClassificationStatus } from '../business/entities/conversation.entity';
import { BusinessCustomer } from '../business/entities/business-customer.entity';
import {
  ConversationParticipant,
  ParticipantPrincipalType,
  ParticipantStatus,
} from '../business/entities/conversation-participant.entity';
import { ConversationParticipantState } from '../business/entities/conversation-participant-state.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { ParticipantResolutionService } from '../business/participant-resolution.service';
import { ConversationClassifierService } from '../business/conversation-classifier.service';

config();

/**
 * Standalone, manually-invoked maintenance tool for the historical
 * conversation-classification/participant backfill (Stage 2 item 22/26/
 * 27/28). Constructs the REAL ConversationClassifierService/
 * ParticipantResolutionService classes -- never reimplements their
 * decision logic with separate SQL -- against a bare TypeORM DataSource,
 * deliberately WITHOUT ever calling NestFactory.create()/
 * createApplicationContext(). This is a structural guarantee, not a
 * convention: @nestjs/schedule's @Cron only has any effect once Nest's
 * own SchedulerRegistry is wired up by an actual Nest application
 * bootstrap, and this file never performs one -- so it is not possible
 * for this process to ever arm any of this codebase's unrelated
 * production cron jobs (brand-authorizations, daily-batches, invoices,
 * offers, orders, shipping, warranty), regardless of what this file
 * imports.
 *
 * Intended invocation: a Render one-off job against the already-deployed
 * bishoo-backend build (`render jobs create <service-id> --start-command
 * "node dist/database/backfill-conversation-classification.js [flags]"`),
 * which inherits the real service's own environment variables -- this
 * script never needs, prints, or stores a credential of its own.
 *
 * Dry-run by default. Requires `--execute` to write anything. `offset` is
 * intentionally NOT a CLI flag -- it is hard-coded to 0 below, because
 * ConversationClassifierService.classifyAndBackfillBatch() only ever
 * selects LEGACY_UNSCOPED rows: a row drops out of that set the moment
 * it's classified, so re-querying from offset=0 is what naturally
 * converges to nothing left to do, while an incrementing offset would
 * skip rows (see conversation-classifier.service.spec.ts's "batching /
 * resumability" tests for the proof).
 */

// ── Entity closure ──────────────────────────────────────────────────────────
// Proven locally via DataSource.initialize() against a real database, not
// guessed: TypeORM requires every entity reachable via a relation from the
// classifier's own dependency graph to be registered, or initialize()
// throws a clear metadata error. This is that exact closure.
const ENTITIES = [
  Conversation,
  BusinessCustomer,
  AccountRole,
  ConversationParticipant,
  ConversationParticipantState,
  User,
  SellerProfile,
  Agent,
  SuperAgent,
  TransportProvider,
  ActiveRoleSession,
];

// Reads the exact same env var NAMES app.module.ts's TypeOrmModule.forRoot()
// reads. Deliberately NOT importing/duplicating app.module.ts's connection
// object (that file also boots the full HTTP app, CORS, Swagger, every
// feature module, and ScheduleModule -- none of which belong in a bare
// maintenance DataSource) -- reading the same live env vars this process
// inherits (from the Render one-off job's own environment, identical to the
// deployed service's) means there is no hardcoded value to drift; the only
// way this could silently diverge is if app.module.ts renamed one of these
// vars without updating this file too, which would fail loudly (connection
// error) rather than silently pointing at the wrong database.
export function buildDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kentexa',
    synchronize: false,
    entities: ENTITIES,
  });
}

export interface CliOptions {
  execute: boolean;
  batchSize: number;
  expectResolved: number;
  expectExternal: number;
  expectAmbiguous: number;
}

export function parseArgs(argv: string[]): CliOptions {
  const flag = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const eq = argv.find((a) => a.startsWith(prefix));
    if (eq) return eq.slice(prefix.length);
    const idx = argv.indexOf(`--${name}`);
    if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
    return undefined;
  };
  if (argv.includes('--offset') || argv.some((a) => a.startsWith('--offset='))) {
    throw new Error('--offset is not a supported flag: offset is hard-coded to 0 by design (see file header comment).');
  }
  return {
    execute: argv.includes('--execute'),
    batchSize: parseInt(flag('batch-size') ?? '50', 10),
    expectResolved: parseInt(flag('expect-resolved') ?? '7', 10),
    expectExternal: parseInt(flag('expect-external') ?? '1', 10),
    expectAmbiguous: parseInt(flag('expect-ambiguous') ?? '5', 10),
  };
}

const EXPECTED_MIGRATIONS = [
  'BaselineRenderProductionSchema1788256800000',
  'AddAccountRoleAndActiveRoleSession1788257400000',
  'FixActiveRoleSessionUuidDefault1788258000000',
  'AddCommunicationParticipantAudience1788258600000',
];

interface ParticipantKey {
  conversationId: number;
  principalType: string;
  key: string; // accountRoleId or externalCustomerId, stringified
}

function keyOf(conversationId: number, principalType: string, id: number): string {
  return `${conversationId}:${principalType}:${id}`;
}

/**
 * Computes the deterministic expected participant set for every currently
 * LEGACY_UNSCOPED conversation, using the REAL classifier's classify()
 * decision for each row (never re-derived independently) plus the same
 * real AccountRole/BusinessCustomer repository lookups the classifier's
 * own write path performs -- not raw SQL, not a parallel decision engine.
 */
export async function computeExpectedParticipants(
  dataSource: DataSource,
  classifier: ConversationClassifierService,
): Promise<{ expected: ParticipantKey[]; distribution: { resolved: number; external: number; ambiguous: number } }> {
  const convoRepo = dataSource.getRepository(Conversation);
  const accountRoleRepo = dataSource.getRepository(AccountRole);
  const customerRepo = dataSource.getRepository(BusinessCustomer);

  const rows = await convoRepo.find({
    where: { classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED },
    order: { id: 'ASC' },
  });

  const expected: ParticipantKey[] = [];
  let resolved = 0, external = 0, ambiguous = 0;

  for (const convo of rows) {
    const result = await classifier.classify(convo);
    if (result.status === ConversationClassificationStatus.RESOLVED) {
      resolved++;
      const sellerRole = await accountRoleRepo.findOne({
        where: { userId: convo.sellerId, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE },
      });
      if (sellerRole) expected.push({ conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, key: keyOf(convo.id, ParticipantPrincipalType.ACCOUNT_ROLE, sellerRole.id) });
      const customer = convo.customerId ? await customerRepo.findOne({ where: { id: convo.customerId } }) : null;
      const buyerRole = customer?.userId
        ? await accountRoleRepo.findOne({ where: { userId: customer.userId, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE } })
        : null;
      if (buyerRole) expected.push({ conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, key: keyOf(convo.id, ParticipantPrincipalType.ACCOUNT_ROLE, buyerRole.id) });
    } else if (result.status === ConversationClassificationStatus.EXTERNAL_CONTACT) {
      external++;
      const sellerRole = await accountRoleRepo.findOne({
        where: { userId: convo.sellerId, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE },
      });
      if (sellerRole) expected.push({ conversationId: convo.id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, key: keyOf(convo.id, ParticipantPrincipalType.ACCOUNT_ROLE, sellerRole.id) });
      if (convo.customerId) expected.push({ conversationId: convo.id, principalType: ParticipantPrincipalType.EXTERNAL_CONTACT, key: keyOf(convo.id, ParticipantPrincipalType.EXTERNAL_CONTACT, convo.customerId) });
    } else {
      ambiguous++;
    }
  }

  return { expected, distribution: { resolved, external, ambiguous } };
}

/**
 * `argvOverride`/`dataSourceOverride` exist purely for testability (see
 * backfill-conversation-classification.spec.ts) -- the real CLI entrypoint
 * at the bottom of this file calls main() with neither, so production
 * behavior is unaffected: argv comes from process.argv and the DataSource
 * from buildDataSource() exactly as before.
 */
export async function main(argvOverride?: string[], dataSourceOverride?: DataSource): Promise<number> {
  const opts = parseArgs(argvOverride ?? process.argv.slice(2));
  const dataSource = dataSourceOverride ?? buildDataSource();
  let exitCode = 0;

  try {
    if (!dataSource.isInitialized) await dataSource.initialize();
    console.log(`[classifier-backfill] connected. mode=${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`);

    const identity = await dataSource.query('select current_database() as db');
    console.log(`[classifier-backfill] database identity: ${identity[0].db}`);

    // Migration 4 prerequisite -- a tripwire, not the primary safety
    // mechanism (the running app already assumes this schema exists).
    const ledger: { name: string }[] = await dataSource.query('select name from typeorm_migrations');
    const ledgerNames = new Set(ledger.map((r) => r.name));
    const missingMigrations = EXPECTED_MIGRATIONS.filter((m) => !ledgerNames.has(m));
    if (missingMigrations.length) {
      throw new Error(`Migration prerequisite failed -- missing from ledger: ${missingMigrations.join(', ')}`);
    }
    console.log(`[classifier-backfill] migration ledger OK (${EXPECTED_MIGRATIONS.length}/${EXPECTED_MIGRATIONS.length} expected migrations present).`);

    const convoRepo = dataSource.getRepository(Conversation);
    const legacyCount = await convoRepo.count({ where: { classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED } });
    console.log(`[classifier-backfill] LEGACY_UNSCOPED conversations: ${legacyCount}`);
    if (opts.batchSize < legacyCount) {
      throw new Error(`--batch-size ${opts.batchSize} is smaller than the live LEGACY_UNSCOPED count (${legacyCount}) -- this tool requires a single batch covering the complete set. Re-run with a larger --batch-size.`);
    }

    const participants = new ParticipantResolutionService(
      dataSource.getRepository(ConversationParticipant),
      dataSource.getRepository(ConversationParticipantState),
    );
    const classifier = new ConversationClassifierService(
      convoRepo,
      dataSource.getRepository(BusinessCustomer),
      dataSource.getRepository(AccountRole),
      participants,
      dataSource,
    );

    // ── Pre-write gate (always computed, in both dry-run and execute mode) ──
    const { expected, distribution } = await computeExpectedParticipants(dataSource, classifier);
    console.log(
      `[classifier-backfill] classification distribution: RESOLVED=${distribution.resolved} EXTERNAL_CONTACT=${distribution.external} AMBIGUOUS=${distribution.ambiguous}`,
    );

    if (
      distribution.resolved !== opts.expectResolved ||
      distribution.external !== opts.expectExternal ||
      distribution.ambiguous !== opts.expectAmbiguous
    ) {
      throw new Error(
        `Classification distribution mismatch. Expected RESOLVED=${opts.expectResolved} EXTERNAL_CONTACT=${opts.expectExternal} AMBIGUOUS=${opts.expectAmbiguous}; ` +
        `got RESOLVED=${distribution.resolved} EXTERNAL_CONTACT=${distribution.external} AMBIGUOUS=${distribution.ambiguous}. Refusing to proceed on a changed dataset.`,
      );
    }

    const existingActive = await dataSource.getRepository(ConversationParticipant).find({ where: { status: ParticipantStatus.ACTIVE } });
    const expectedKeySet = new Set(expected.map((e) => e.key));

    // Re-derive AMBIGUOUS conversation ids directly via the real classify()
    // call (already run once above inside computeExpectedParticipants;
    // re-running it here is cheap for this dataset size and keeps this
    // specific invariant check self-contained and easy to audit on its own).
    const ambiguousConversationIds = new Set<number>();
    const legacyRows = await convoRepo.find({ where: { classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED } });
    for (const convo of legacyRows) {
      const result = await classifier.classify(convo);
      if (result.status === ConversationClassificationStatus.AMBIGUOUS) ambiguousConversationIds.add(convo.id);
    }

    const unexpected = existingActive.filter((p) => {
      const k = p.principalType === ParticipantPrincipalType.EXTERNAL_CONTACT
        ? keyOf(p.conversationId, p.principalType, p.externalCustomerId as number)
        : keyOf(p.conversationId, p.principalType, p.accountRoleId as number);
      return !expectedKeySet.has(k);
    });
    const onAmbiguous = existingActive.filter((p) => ambiguousConversationIds.has(p.conversationId));
    const canonicalExisting = existingActive.filter((p) => !unexpected.includes(p) );

    console.log(`[classifier-backfill] existing active participants: ${existingActive.length} (canonical: ${canonicalExisting.length}, unexpected: ${unexpected.length}, on AMBIGUOUS conversations: ${onAmbiguous.length})`);
    console.log(`[classifier-backfill] expected participant set size: ${expected.length}; missing (would be created): ${expected.length - canonicalExisting.length}`);

    if (unexpected.length > 0) {
      throw new Error(`Pre-write invariant violated: ${unexpected.length} existing active participant(s) are NOT in the deterministic expected set: ${JSON.stringify(unexpected.map((p) => ({ id: p.id, conversationId: p.conversationId })))}`);
    }
    if (onAmbiguous.length > 0) {
      throw new Error(`Pre-write invariant violated: ${onAmbiguous.length} participant(s) exist on an AMBIGUOUS conversation, which must have zero participants.`);
    }
    console.log('[classifier-backfill] pre-write invariant satisfied: every existing active participant is canonical, zero participants on AMBIGUOUS conversations, zero unexpected. (Does NOT require participant count == 0.)');

    if (!opts.execute) {
      console.log('[classifier-backfill] DRY RUN complete. No writes performed. Re-run with --execute to apply.');
      return exitCode;
    }

    // ── Execute ──────────────────────────────────────────────────────────────
    console.log(`[classifier-backfill] EXECUTING classifyAndBackfillBatch(batchSize=${opts.batchSize}, offset=0, stopOnError=true)...`);
    const report = await classifier.classifyAndBackfillBatch(opts.batchSize, 0, true);
    console.log('[classifier-backfill] execution report:', JSON.stringify(report, null, 2));

    if (report.errors > 0) {
      exitCode = 1;
      console.error('[classifier-backfill] STOPPED due to an unexpected per-conversation failure. No further conversations were processed. Do not retry automatically -- inspect the failure above.');
      return exitCode;
    }

    // ── Post-execution verification ─────────────────────────────────────────
    const finalDistribution = await convoRepo
      .createQueryBuilder('c')
      .select('c."classificationStatus"', 'status')
      .addSelect('count(*)', 'count')
      .groupBy('c."classificationStatus"')
      .getRawMany();
    const finalParticipantCount = await dataSource.getRepository(ConversationParticipant).count({ where: { status: ParticipantStatus.ACTIVE } });
    console.log('[classifier-backfill] post-execution classification distribution:', JSON.stringify(finalDistribution));
    console.log(`[classifier-backfill] post-execution active participant count: ${finalParticipantCount}`);
    console.log('[classifier-backfill] EXECUTE complete.');
    return exitCode;
  } catch (err: any) {
    exitCode = 1;
    console.error('[classifier-backfill] FAILED:', err.message);
    return exitCode;
  } finally {
    // Only close a DataSource this function created itself -- a caller
    // (a test) that supplied its own DataSource via dataSourceOverride
    // owns that connection's lifecycle and may reuse it across multiple
    // main() calls.
    if (!dataSourceOverride && dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('[classifier-backfill] DataSource closed.');
    }
    process.exitCode = exitCode;
  }
}

/* istanbul ignore next -- real CLI entrypoint; exercised via the built dist/ file, not unit tests */
if (require.main === module) {
  main();
}
