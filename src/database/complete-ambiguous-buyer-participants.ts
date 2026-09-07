import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Conversation, ConversationClassificationStatus } from '../business/entities/conversation.entity';
import { BusinessCustomer } from '../business/entities/business-customer.entity';
import { ConversationParticipant, ParticipantKind, ParticipantPrincipalType, ParticipantStatus } from '../business/entities/conversation-participant.entity';
import { ConversationParticipantState } from '../business/entities/conversation-participant-state.entity';
import { AccountRole } from '../role-context/entities/account-role.entity';
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
 * Standalone, manually-invoked, ONE-TIME tool: completes the independently
 * canonical Buyer side for a small, explicit, human-supplied list of
 * AMBIGUOUS conversations (the policy decision approved alongside this
 * file: "for an AMBIGUOUS conversation, an independently and
 * deterministically resolved participant side may be materialized without
 * resolving or repairing the ambiguous side" -- the same model already
 * organically true of production conversation 2).
 *
 * This is deliberately NOT the historical classifier/backfill tool and
 * must never behave like it: it NEVER writes classificationStatus,
 * classificationReason, or classifiedAt, NEVER touches the Seller side,
 * NEVER creates/activates an AccountRole, and NEVER selects its own target
 * conversations -- the caller must name them explicitly via
 * --conversation-ids, and each one's Buyer identity is re-resolved fresh,
 * right now, via the same real, authoritative
 * ConversationClassifierService.resolveBuyerRole() the classifier itself
 * trusts -- never a hardcoded AccountRole id from a prior report.
 *
 * Same structural safety guarantees as backfill-conversation-classification.ts:
 * bare TypeORM DataSource, no NestFactory/AppModule/ScheduleModule (cannot
 * arm any unrelated cron job), dry-run by default, --execute + a purpose-
 * specific confirmation token required to write, per-conversation
 * transaction, strict argument parsing.
 */

const ENTITIES = [
  Conversation, BusinessCustomer, AccountRole, ConversationParticipant,
  ConversationParticipantState, User, SellerProfile, Agent, SuperAgent,
  TransportProvider, ActiveRoleSession,
];

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

export const REQUIRED_CONFIRMATION_TOKEN = 'KENTEXA-AMBIGUOUS-BUYER-COMPLETION';
const RECOGNIZED_FLAGS = new Set(['execute', 'conversation-ids', 'confirm-production-participant-completion']);

function flagNameOf(token: string): string | null {
  if (!token.startsWith('--')) return null;
  const body = token.slice(2);
  const eqIdx = body.indexOf('=');
  return eqIdx === -1 ? body : body.slice(0, eqIdx);
}

export interface CliOptions {
  execute: boolean;
  conversationIds: number[];
  confirmToken?: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const seenCounts = new Map<string, number>();
  for (const token of argv) {
    const name = flagNameOf(token);
    if (name === null) continue;
    if (!RECOGNIZED_FLAGS.has(name)) throw new Error(`Unknown argument: --${name}`);
    seenCounts.set(name, (seenCounts.get(name) ?? 0) + 1);
  }
  for (const [name, count] of seenCounts) {
    if (count > 1) throw new Error(`Duplicate argument: --${name} was supplied ${count} times -- pass it exactly once.`);
  }

  const flag = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const eq = argv.find((a) => a.startsWith(prefix));
    if (eq) return eq.slice(prefix.length);
    const idx = argv.indexOf(`--${name}`);
    if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
    return undefined;
  };

  const execute = argv.includes('--execute');
  const rawIds = flag('conversation-ids');
  if (!rawIds) throw new Error('--conversation-ids is required (e.g. --conversation-ids 7,8,14,17) -- this tool never selects its own targets.');
  const conversationIds = rawIds.split(',').map((s) => {
    const trimmed = s.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error(`--conversation-ids contains a non-integer value: "${trimmed}"`);
    return parseInt(trimmed, 10);
  });
  if (!conversationIds.length) throw new Error('--conversation-ids must name at least one conversation.');

  const confirmToken = flag('confirm-production-participant-completion');
  if (execute && confirmToken !== REQUIRED_CONFIRMATION_TOKEN) {
    throw new Error(`--execute requires --confirm-production-participant-completion ${REQUIRED_CONFIRMATION_TOKEN} -- missing or incorrect confirmation.`);
  }

  return { execute, conversationIds, confirmToken };
}

export interface TargetResult {
  conversationId: number;
  outcome: 'created' | 'already-present' | 'skipped-not-deterministic' | 'skipped-not-ambiguous' | 'skipped-not-found' | 'error';
  detail: string;
  buyerAccountRoleId?: number;
}

export async function main(argvOverride?: string[], dataSourceOverride?: DataSource): Promise<number> {
  let opts;
  try {
    opts = parseArgs(argvOverride ?? process.argv.slice(2));
  } catch (err: any) {
    console.error('[buyer-completion] FAILED:', err.message);
    process.exitCode = 1;
    return 1;
  }

  const dataSource = dataSourceOverride ?? buildDataSource();
  let exitCode = 0;
  const results: TargetResult[] = [];

  try {
    if (!dataSource.isInitialized) await dataSource.initialize();
    console.log(`[buyer-completion] connected. mode=${opts.execute ? 'EXECUTE' : 'DRY-RUN'} targets=${opts.conversationIds.join(',')}`);

    const identity = await dataSource.query('select current_database() as db');
    console.log(`[buyer-completion] database identity: ${identity[0].db}`);

    const convoRepo = dataSource.getRepository(Conversation);
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

    for (const id of opts.conversationIds) {
      const convo = await convoRepo.findOne({ where: { id } });
      if (!convo) {
        results.push({ conversationId: id, outcome: 'skipped-not-found', detail: 'conversation does not exist' });
        continue;
      }
      if (convo.classificationStatus !== ConversationClassificationStatus.AMBIGUOUS) {
        results.push({ conversationId: id, outcome: 'skipped-not-ambiguous', detail: `current classificationStatus is "${convo.classificationStatus}", not ambiguous -- situation has changed since this was authorized, refusing to touch it` });
        continue;
      }

      // Re-resolved fresh, right now, via the real classifier -- never a
      // hardcoded id from a prior report.
      const buyerRole = await classifier.resolveBuyerRole(convo);
      if (!buyerRole) {
        results.push({ conversationId: id, outcome: 'skipped-not-deterministic', detail: 'Buyer side no longer independently resolves -- refusing to guess' });
        continue;
      }

      const existing = await dataSource.getRepository(ConversationParticipant).findOne({
        where: { conversationId: id, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, accountRoleId: buyerRole.id, status: ParticipantStatus.ACTIVE },
      });
      if (existing) {
        results.push({ conversationId: id, outcome: 'already-present', detail: 'canonical Buyer participant already exists', buyerAccountRoleId: buyerRole.id });
        continue;
      }

      if (!opts.execute) {
        results.push({ conversationId: id, outcome: 'created', detail: 'DRY RUN -- would create this participant', buyerAccountRoleId: buyerRole.id });
        continue;
      }

      // Single, narrow write: the existing canonical primitive, inside its
      // own transaction, never touching Conversation at all.
      await dataSource.transaction(async (manager) => {
        await participants.ensureAccountRoleParticipant(id, buyerRole.id, ParticipantKind.BUYER, {}, manager);
      });
      results.push({ conversationId: id, outcome: 'created', detail: 'Buyer participant created', buyerAccountRoleId: buyerRole.id });
    }

    console.log('[buyer-completion] results:', JSON.stringify(results, null, 2));

    if (results.some((r) => r.outcome === 'error')) exitCode = 1;

    console.log(opts.execute ? '[buyer-completion] EXECUTE complete.' : '[buyer-completion] DRY RUN complete. No writes performed.');
    return exitCode;
  } catch (err: any) {
    exitCode = 1;
    console.error('[buyer-completion] FAILED:', err.message);
    return exitCode;
  } finally {
    if (!dataSourceOverride && dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('[buyer-completion] DataSource closed.');
    }
    process.exitCode = exitCode;
  }
}

/* istanbul ignore next -- real CLI entrypoint; exercised via the built dist/ file, not unit tests */
if (require.main === module) {
  main();
}
