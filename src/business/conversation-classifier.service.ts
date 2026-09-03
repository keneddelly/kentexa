import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationClassificationStatus } from './entities/conversation.entity';
import { BusinessCustomer } from './entities/business-customer.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { ParticipantResolutionService } from './participant-resolution.service';
import { ParticipantKind } from './entities/conversation-participant.entity';

export interface ClassificationResult {
  status: ConversationClassificationStatus;
  reason: string;
}

export interface ClassificationBatchReport {
  scanned: number;
  resolved: number;
  externalContact: number;
  ambiguous: number;
  errors: number;
  byReason: Record<string, number>;
}

/**
 * Stage 2 item 22/26/27/28: classifies EXISTING (legacy, pre-Stage-2)
 * Conversation rows into RESOLVED / EXTERNAL_CONTACT / AMBIGUOUS using only
 * deterministic rules -- never guesses which seller/profile/workspace a
 * historically-unscoped conversation belongs to. Only RESOLVED records are
 * ever safe to auto-backfill (create real participants for); AMBIGUOUS
 * records stay LEGACY_UNSCOPED/AMBIGUOUS and are excluded from any future
 * scoped read path (SCOPED_CONVERSATION_READ) until a human resolves them.
 *
 * NOT wired into any module bootstrap, cron, or migration -- this is a
 * standalone, manually-invoked tool (via a future admin endpoint or a
 * one-off script), consistent with "do not run production migrations" /
 * "production profiling is still deferred" for this pass. batchSize/offset
 * are caller-supplied, not hardcoded, because the right batch size depends
 * on production Conversation cardinality this pass has no access to
 * (documented in the Stage 2 final report as a production-profiling
 * requirement before this is ever run at scale).
 */
@Injectable()
export class ConversationClassifierService {
  private readonly logger = new Logger(ConversationClassifierService.name);

  constructor(
    @InjectRepository(Conversation) private readonly convoRepo: Repository<Conversation>,
    @InjectRepository(BusinessCustomer) private readonly customerRepo: Repository<BusinessCustomer>,
    @InjectRepository(AccountRole) private readonly accountRoleRepo: Repository<AccountRole>,
    private readonly participants: ParticipantResolutionService,
  ) {}

  /**
   * Pure, side-effect-free classification of a single conversation. Every
   * branch is a deterministic, explainable fact -- never a heuristic guess
   * ("pick the first seller profile", "assume the most recent role").
   */
  async classify(convo: Conversation): Promise<ClassificationResult> {
    if (!convo.sellerId) {
      return { status: ConversationClassificationStatus.AMBIGUOUS, reason: 'missing_seller_id' };
    }
    const sellerRole = await this.accountRoleRepo.findOne({
      where: { userId: convo.sellerId, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE },
    });
    if (!sellerRole) {
      // Could be a seller whose AccountRole was never synced (pre-Stage-1
      // fix, see commit 7e7d4c9), or one currently suspended/rejected --
      // either way, not safe to assume which workspace this is without a
      // human check.
      return { status: ConversationClassificationStatus.AMBIGUOUS, reason: 'no_active_seller_account_role' };
    }

    if (!convo.customerId) {
      return { status: ConversationClassificationStatus.AMBIGUOUS, reason: 'missing_customer_id' };
    }
    const customer = await this.customerRepo.findOne({ where: { id: convo.customerId } });
    if (!customer) {
      return { status: ConversationClassificationStatus.AMBIGUOUS, reason: 'customer_record_not_found' };
    }
    if (!customer.userId) {
      // A WhatsApp/manual contact with no KenteXa account -- deterministic,
      // not ambiguous: this side simply has no AccountRole to resolve, ever.
      return { status: ConversationClassificationStatus.EXTERNAL_CONTACT, reason: 'customer_has_no_linked_user_account' };
    }
    const buyerRole = await this.accountRoleRepo.findOne({
      where: { userId: customer.userId, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE },
    });
    if (!buyerRole) {
      return { status: ConversationClassificationStatus.AMBIGUOUS, reason: 'no_active_buyer_account_role' };
    }

    return { status: ConversationClassificationStatus.RESOLVED, reason: 'seller_and_buyer_account_roles_resolved' };
  }

  /** Dry run: classifies a batch and reports what WOULD happen, writes nothing. */
  async classifyBatchDryRun(batchSize: number, offset: number): Promise<ClassificationBatchReport> {
    const rows = await this.convoRepo.find({
      where: { classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED },
      order: { id: 'ASC' },
      take: batchSize,
      skip: offset,
    });
    const report: ClassificationBatchReport = {
      scanned: rows.length, resolved: 0, externalContact: 0, ambiguous: 0, errors: 0, byReason: {},
    };
    for (const convo of rows) {
      try {
        const result = await this.classify(convo);
        report.byReason[result.reason] = (report.byReason[result.reason] || 0) + 1;
        if (result.status === ConversationClassificationStatus.RESOLVED) report.resolved++;
        else if (result.status === ConversationClassificationStatus.EXTERNAL_CONTACT) report.externalContact++;
        else report.ambiguous++;
      } catch (err: any) {
        report.errors++;
        this.logger.warn(`Classification failed for conversation #${convo.id}: ${err?.message}`);
      }
    }
    return report;
  }

  /**
   * Writes classificationStatus for a batch, and for RESOLVED rows only,
   * also creates the real seller/buyer ConversationParticipant rows (same
   * idempotent ensure path the live dual-write uses) -- the one and only
   * kind of record this service is allowed to backfill automatically.
   * AMBIGUOUS rows get classificationStatus=AMBIGUOUS + a reason (visible
   * for a human to resolve later) but no participants and no guessed
   * ownership. EXTERNAL_CONTACT rows get an external-contact participant
   * for the customer side, and a seller participant if resolvable.
   */
  async classifyAndBackfillBatch(batchSize: number, offset: number): Promise<ClassificationBatchReport> {
    const rows = await this.convoRepo.find({
      where: { classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED },
      order: { id: 'ASC' },
      take: batchSize,
      skip: offset,
      relations: { customer: true },
    });
    const report: ClassificationBatchReport = {
      scanned: rows.length, resolved: 0, externalContact: 0, ambiguous: 0, errors: 0, byReason: {},
    };
    for (const convo of rows) {
      try {
        const result = await this.classify(convo);
        report.byReason[result.reason] = (report.byReason[result.reason] || 0) + 1;
        await this.convoRepo.update(convo.id, {
          classificationStatus: result.status,
          classificationReason: result.reason,
          classifiedAt: new Date(),
        });

        if (result.status === ConversationClassificationStatus.RESOLVED) {
          report.resolved++;
          const sellerRole = await this.accountRoleRepo.findOne({
            where: { userId: convo.sellerId, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE },
          });
          if (sellerRole) {
            await this.participants.ensureAccountRoleParticipant(convo.id, sellerRole.id, ParticipantKind.SELLER);
          }
          const buyerRole = convo.customer?.userId
            ? await this.accountRoleRepo.findOne({
                where: { userId: convo.customer.userId, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE },
              })
            : null;
          if (buyerRole) {
            await this.participants.ensureAccountRoleParticipant(convo.id, buyerRole.id, ParticipantKind.BUYER);
          }
        } else if (result.status === ConversationClassificationStatus.EXTERNAL_CONTACT) {
          report.externalContact++;
          if (convo.customerId) {
            await this.participants.ensureExternalContactParticipant(convo.id, convo.customerId);
          }
        } else {
          report.ambiguous++; // no participants created -- quarantined until a human resolves it
        }
      } catch (err: any) {
        report.errors++;
        this.logger.warn(`Classify+backfill failed for conversation #${convo.id}: ${err?.message}`);
      }
    }
    return report;
  }
}
