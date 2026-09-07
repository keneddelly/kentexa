import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Conversation, ConversationClassificationStatus } from '../business/entities/conversation.entity';
import { BusinessCustomer } from '../business/entities/business-customer.entity';
import {
  ConversationParticipant,
  ParticipantKind,
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
  confirmToken?: string;
}

// Purpose-specific confirmation required in addition to --execute. This is
// deliberately not a secret, not a credential, and not derived from
// anything production-specific -- it is a literal, unique, hard-to-type-
// by-accident string whose only job is to make --execute alone
// insufficient to mutate anything, the way "type the resource name to
// confirm" patterns work elsewhere. It never touches a database URL or
// credential of any kind.
export const REQUIRED_CONFIRMATION_TOKEN = 'KENTEXA-CONVERSATION-BACKFILL';

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

  const execute = argv.includes('--execute');
  const rawResolved = flag('expect-resolved');
  const rawExternal = flag('expect-external');
  const rawAmbiguous = flag('expect-ambiguous');
  const confirmToken = flag('confirm-production-backfill');

  // --execute may never silently inherit the dry-run convenience defaults
  // (7/1/5) -- an operator re-running this tool weeks later against a
  // changed dataset must consciously state their current expectation, not
  // rely on numbers baked in at review time. Checked here, before any
  // DataSource is even constructed, so a missing/wrong value can never
  // reach a mutation path.
  if (execute && (rawResolved === undefined || rawExternal === undefined || rawAmbiguous === undefined)) {
    throw new Error(
      '--execute requires explicit --expect-resolved, --expect-external, and --expect-ambiguous -- ' +
      'silently inheriting the dry-run defaults (7/1/5) during execution is not permitted.',
    );
  }
  // A second, purpose-specific confirmation beyond --execute alone -- a
  // single common flag is more susceptible to appearing in copy-pasted
  // shell history than a unique, purpose-specific literal string.
  if (execute && confirmToken !== REQUIRED_CONFIRMATION_TOKEN) {
    throw new Error(
      `--execute requires --confirm-production-backfill ${REQUIRED_CONFIRMATION_TOKEN} -- missing or incorrect confirmation.`,
    );
  }

  return {
    execute,
    batchSize: parseInt(flag('batch-size') ?? '50', 10),
    expectResolved: rawResolved !== undefined ? parseInt(rawResolved, 10) : 7,
    expectExternal: rawExternal !== undefined ? parseInt(rawExternal, 10) : 1,
    expectAmbiguous: rawAmbiguous !== undefined ? parseInt(rawAmbiguous, 10) : 5,
    confirmToken,
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

export interface ParticipantValidation {
  participant: ConversationParticipant;
  reason: string;
}

/**
 * Participant-level canonicality gate (Ambiguous Partial-Participant
 * Semantics Review). Replaces the earlier "AMBIGUOUS conversation ⇒
 * expected participant set is empty" rule: every existing ACTIVE
 * participant, on ANY conversation regardless of its overall classify()
 * verdict, must independently match the deterministic per-side identity
 * the classifier itself trusts (resolveSellerRole/resolveBuyerRole/
 * resolveExternalContact) -- never merely because the row exists, never
 * from User.role/activeRoles, never from historical ownership.
 *
 * This means an AMBIGUOUS conversation MAY legitimately retain an existing
 * participant for whichever single side independently resolves (e.g.
 * conversation 2's Buyer AccountRole 26 -- the Buyer side is deterministically
 * known even though the Seller side, seller 10's missing AccountRole, is
 * not) -- while the unresolved side is never treated as anything but
 * absent. This function only VALIDATES what already exists; it never
 * creates, repairs, or infers a missing participant for either side.
 */
export async function validateExistingParticipants(
  dataSource: DataSource,
  classifier: ConversationClassifierService,
): Promise<{ valid: ConversationParticipant[]; invalid: ParticipantValidation[] }> {
  const convoRepo = dataSource.getRepository(Conversation);
  const existingActive = await dataSource.getRepository(ConversationParticipant).find({ where: { status: ParticipantStatus.ACTIVE } });

  const valid: ConversationParticipant[] = [];
  const invalid: ParticipantValidation[] = [];
  const convoCache = new Map<number, Conversation | null>();

  const getConvo = async (id: number): Promise<Conversation | null> => {
    if (!convoCache.has(id)) convoCache.set(id, await convoRepo.findOne({ where: { id } }));
    return convoCache.get(id) ?? null;
  };

  for (const p of existingActive) {
    const convo = await getConvo(p.conversationId);
    if (!convo) {
      invalid.push({ participant: p, reason: `conversation ${p.conversationId} no longer exists` });
      continue;
    }

    if (p.principalType === ParticipantPrincipalType.ACCOUNT_ROLE && p.participantKind === ParticipantKind.SELLER) {
      const sellerRole = await classifier.resolveSellerRole(convo);
      if (sellerRole && sellerRole.id === p.accountRoleId) valid.push(p);
      else invalid.push({ participant: p, reason: 'accountRoleId does not match the independently resolved Seller AccountRole for this conversation' });
    } else if (p.principalType === ParticipantPrincipalType.ACCOUNT_ROLE && p.participantKind === ParticipantKind.BUYER) {
      const buyerRole = await classifier.resolveBuyerRole(convo);
      if (buyerRole && buyerRole.id === p.accountRoleId) valid.push(p);
      else invalid.push({ participant: p, reason: 'accountRoleId does not match the independently resolved Buyer AccountRole for this conversation' });
    } else if (p.principalType === ParticipantPrincipalType.EXTERNAL_CONTACT) {
      const externalCustomer = await classifier.resolveExternalContact(convo);
      if (externalCustomer && externalCustomer.id === p.externalCustomerId) valid.push(p);
      else invalid.push({ participant: p, reason: 'externalCustomerId does not match the independently resolved external-contact BusinessCustomer for this conversation' });
    } else {
      // ACCOUNT/WORKSPACE principals, or any other participantKind/
      // principalType combination: not produced or required by the
      // current classifier model at all. Fail closed rather than
      // silently accepting an unrecognized shape.
      invalid.push({ participant: p, reason: `unsupported/unknown principalType "${p.principalType}" / participantKind "${p.participantKind}" -- fails closed` });
    }
  }

  return { valid, invalid };
}

/**
 * `argvOverride`/`dataSourceOverride` exist purely for testability (see
 * backfill-conversation-classification.spec.ts) -- the real CLI entrypoint
 * at the bottom of this file calls main() with neither, so production
 * behavior is unaffected: argv comes from process.argv and the DataSource
 * from buildDataSource() exactly as before.
 */
export async function main(argvOverride?: string[], dataSourceOverride?: DataSource): Promise<number> {
  // Argument validation (including the --execute safeguards) happens
  // before a DataSource even exists, so a malformed/incomplete invocation
  // fails closed with a clean, consistent exit code -- never an unhandled
  // rejection -- and never opens any connection at all.
  let opts;
  try {
    opts = parseArgs(argvOverride ?? process.argv.slice(2));
  } catch (err: any) {
    console.error('[classifier-backfill] FAILED:', err.message);
    process.exitCode = 1;
    return 1;
  }

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

    // ── Participant-level canonicality gate ──────────────────────────────
    // Every existing active participant, on ANY conversation regardless of
    // its overall classify() verdict, must independently match the
    // deterministic per-side identity the classifier trusts. This is what
    // lets conversation 2's Buyer AccountRole 26 remain valid (Buyer side
    // independently resolves) while still failing closed on anything that
    // doesn't -- including a hypothetical Seller participant on the same
    // AMBIGUOUS conversation, which would have no independently resolvable
    // Seller AccountRole to match against.
    const { valid, invalid } = await validateExistingParticipants(dataSource, classifier);
    const expectedTotal = expected.length;
    const alreadyPresentExpected = expected.filter((e) => valid.some((v) => {
      const k = v.principalType === ParticipantPrincipalType.EXTERNAL_CONTACT
        ? keyOf(v.conversationId, v.principalType, v.externalCustomerId as number)
        : keyOf(v.conversationId, v.principalType, v.accountRoleId as number);
      return k === e.key;
    })).length;

    console.log(`[classifier-backfill] existing active participants: ${valid.length + invalid.length} (canonical for their side: ${valid.length}, invalid: ${invalid.length})`);
    console.log(`[classifier-backfill] deterministic expected set for RESOLVED/EXTERNAL_CONTACT conversations: ${expectedTotal}; already present: ${alreadyPresentExpected}; would be newly created: ${expectedTotal - alreadyPresentExpected}`);

    if (invalid.length > 0) {
      throw new Error(
        `Pre-write invariant violated: ${invalid.length} existing active participant(s) do not independently match the deterministic identity for the side they claim to represent: ` +
        JSON.stringify(invalid.map((i) => ({ id: i.participant.id, conversationId: i.participant.conversationId, reason: i.reason }))),
      );
    }
    console.log('[classifier-backfill] pre-write invariant satisfied: every existing active participant independently matches the deterministic identity for its side (participant-level canonicality) -- including any partially-canonical participant on an otherwise AMBIGUOUS conversation. Does NOT require participant count == 0, and does NOT require zero participants on AMBIGUOUS conversations -- only that any participant present is independently provable for its own side.');

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
