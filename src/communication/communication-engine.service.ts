import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationTemplate } from './entities/communication-template.entity';
import { CommunicationLog } from './entities/communication-log.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { CommunicationFeatureFlagsService } from './communication-feature-flags.service';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

export interface DispatchRecipient {
  userId: number;
  role: string;
  actionPage?: string;
  actionParam?: string;
  // Stage 2: optional server-resolved audience principal. Callers that
  // don't yet resolve one keep dispatching exactly as before (recipientRole
  // stays the only recipiency dimension); a caller that does pass one gets
  // that recorded on both the Notification row and CommunicationLog, and
  // folded into the scoped idempotency check below.
  accountRoleId?: number;
  workspaceType?: string;
  workspaceId?: number;
  audienceScope?: 'ACCOUNT' | 'ROLE' | 'WORKSPACE' | 'TRANSACTION';
}

export interface DispatchParams {
  eventType: string;
  sourceType: string;
  sourceId: number;
  recipients: DispatchRecipient[];
  context: Record<string, string | number>;
}

const SEED_TEMPLATES: Array<
  Pick<CommunicationTemplate, 'eventType' | 'recipientRole' | 'titleTemplate' | 'bodyTemplate'>
> = [
  {
    eventType: 'ORDER_PAID',
    recipientRole: 'buyer',
    titleTemplate: 'Malipo yamepokelewa ✅',
    bodyTemplate: 'Malipo yako ya {productName} (Agizo #{orderId}) ya TZS {amount} yamepokelewa. Muuzaji anaandaa agizo lako.',
  },
  {
    eventType: 'ORDER_PAID',
    recipientRole: 'seller',
    titleTemplate: 'Umepokea malipo 💰',
    bodyTemplate: 'Umepokea malipo ya TZS {amount} kwa {productName} (Agizo #{orderId}). Tafadhali andaa agizo kwa ajili ya kutuma.',
  },
  {
    eventType: 'ORDER_PAID_COD',
    recipientRole: 'buyer',
    titleTemplate: 'Malipo ya awali yamepokelewa ✅',
    bodyTemplate: 'Malipo ya awali ya TZS {upfrontAmount} kwa {productName} (Agizo #{orderId}) yamepokelewa. Utalipa TZS {remainingBalance} zilizobaki wakati wa kupokea mzigo.',
  },
  {
    eventType: 'ORDER_PAID_COD',
    recipientRole: 'seller',
    titleTemplate: 'Malipo ya awali yamepokelewa 💰',
    bodyTemplate: 'Umepokea malipo ya awali ya TZS {upfrontAmount} kwa {productName} (Agizo #{orderId}). Baki la TZS {remainingBalance} litakusanywa wakati wa uwasilishaji.',
  },
  {
    eventType: 'ORDER_COMPLETED',
    recipientRole: 'buyer',
    titleTemplate: 'Agizo limekamilika ✅',
    bodyTemplate: 'Agizo lako la {productName} (Agizo #{orderId}) limekamilika. Asante kwa kununua Kentexa!',
  },
  {
    eventType: 'ORDER_COMPLETED',
    recipientRole: 'seller',
    titleTemplate: 'Malipo yametolewa 💰',
    bodyTemplate: 'Agizo #{orderId} ({productName}) limekamilika na TZS {sellerAmount} zimewekwa kwenye pochi yako.',
  },
  {
    eventType: 'ORDER_PLACED',
    recipientRole: 'buyer',
    titleTemplate: '✅ Agizo Limepokelewa',
    bodyTemplate: 'Agizo lako la {productName} (Agizo #{orderId}) limepokelewa. Subiri uthibitisho wa muuzaji.',
  },
  {
    eventType: 'ORDER_DELIVERED',
    recipientRole: 'buyer',
    titleTemplate: '📬 Bidhaa Imefika',
    bodyTemplate: 'Bidhaa yako Order #{orderId} ({trackingNumber}) imefika. Tafadhali ithibitishe kwenye app ili tutoe malipo kwa muuzaji.',
  },
  {
    eventType: 'OUT_FOR_DELIVERY',
    recipientRole: 'buyer',
    titleTemplate: '🚚 Bidhaa Iko Njiani',
    bodyTemplate: 'Kifurushi chako {trackingNumber} (Agizo #{orderId}) kiko njiani kukufikia leo.',
  },
  {
    eventType: 'SHIPPING_PROOF_UPLOADED',
    recipientRole: 'buyer',
    titleTemplate: '📦 Bidhaa Inaandaliwa',
    bodyTemplate: 'Agizo lako #{orderId} linaandaliwa kutumwa kupitia {courierName}. Nambari ya ufuatiliaji: {trackingNumber}.',
  },
  {
    eventType: 'PARCEL_DISPATCHED',
    recipientRole: 'buyer',
    titleTemplate: '📦 Kifurushi Kimetumwa',
    bodyTemplate: 'Kifurushi chako {trackingNumber} kimeondoka {originCity} kuelekea {destinationCity}.',
  },
];

// Phase A of the Kentexa Communication Engine (see spec §1-58 audit).
// Proves the template + log + dispatch pattern end-to-end on one real
// event (ORDER_PAID / ORDER_PAID_COD) before any other event moves onto
// it. SMS/email for this same event keep firing exactly as they do
// today via NotificationsService.orderPaid() — untouched, separate call
// site — this engine only adds the in-app+push leg that was previously
// completely dead (InAppNotificationService.orderPaid() was never
// called anywhere).
@Injectable()
export class CommunicationEngineService implements OnModuleInit {
  private readonly logger = new Logger(CommunicationEngineService.name);

  constructor(
    @InjectRepository(CommunicationTemplate)
    private templateRepo: Repository<CommunicationTemplate>,
    @InjectRepository(CommunicationLog)
    private logRepo: Repository<CommunicationLog>,
    @InjectRepository(AccountRole)
    private accountRoleRepo: Repository<AccountRole>,
    private inAppNotifications: InAppNotificationService,
    private flags: CommunicationFeatureFlagsService,
  ) {}

  /**
   * Stage 2B item 7: recipient.role is already 'seller'/'buyer' (matching
   * AccountRoleType's own string values exactly, and CommunicationTemplate.
   * recipientRole). Resolving the accountRoleId HERE, inside dispatch(),
   * means orders.service.ts/payments.service.ts/daily-batches.service.ts
   * (11 call sites across 3 files) need zero changes -- the same pattern
   * that worked for InAppNotificationService's event helpers (item 6).
   * Never overrides an accountRoleId a caller already resolved and passed
   * explicitly.
   */
  private async resolveRecipientAudience(recipient: DispatchRecipient): Promise<DispatchRecipient> {
    if (recipient.accountRoleId) return recipient;
    const roleType = recipient.role as AccountRoleType;
    if (!Object.values(AccountRoleType).includes(roleType)) return recipient;
    const role = await this.accountRoleRepo.findOne({
      where: { userId: recipient.userId, roleType, status: AccountRoleStatus.ACTIVE },
    });
    if (!role) return recipient;
    const workspace =
      role.profileType && role.profileType !== RoleProfileType.USER && role.profileId != null
        ? { workspaceType: role.profileType as string, workspaceId: role.profileId }
        : {};
    return { ...recipient, accountRoleId: role.id, audienceScope: recipient.audienceScope ?? 'ROLE', ...workspace };
  }

  async onModuleInit() {
    await this.seedTemplates();
  }

  private async seedTemplates(): Promise<void> {
    for (const seed of SEED_TEMPLATES) {
      const existing = await this.templateRepo.findOne({
        where: {
          eventType: seed.eventType,
          channel: 'in_app',
          recipientRole: seed.recipientRole,
          language: 'sw',
        },
      });
      if (!existing) {
        await this.templateRepo.save(
          this.templateRepo.create({
            ...seed,
            channel: 'in_app',
            language: 'sw',
          }),
        );
        this.logger.log(
          `Seeded communication template: ${seed.eventType}/${seed.recipientRole}`,
        );
      }
    }
  }

  private render(template: string, context: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) =>
      context[key] !== undefined ? String(context[key]) : match,
    );
  }

  async dispatch(params: DispatchParams): Promise<void> {
    const channel = 'in_app';
    for (let recipient of params.recipients) {
      if (this.flags.isEnabled('SCOPED_NOTIFICATION_DUAL_WRITE')) {
        recipient = await this.resolveRecipientAudience(recipient);
      }
      const audienceFields =
        this.flags.isEnabled('SCOPED_NOTIFICATION_DUAL_WRITE') && recipient.accountRoleId
          ? {
              recipientAccountRoleId: recipient.accountRoleId,
              recipientWorkspaceType: recipient.workspaceType ?? null,
              recipientWorkspaceId: recipient.workspaceId ?? null,
              audienceScope: recipient.audienceScope ?? 'ROLE',
              transactionType: params.sourceType,
              transactionId: params.sourceId,
            }
          : {};
      try {
        const existingLog = await this.logRepo.findOne({
          where: {
            eventType: params.eventType,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            recipientUserId: recipient.userId,
            recipientRole: recipient.role,
            channel,
          },
        });
        if (existingLog) continue; // idempotency — already dispatched

        // Scoped idempotency check (Stage 2): when a caller resolved a real
        // accountRoleId, also guard against a retry racing past the check
        // above on the accountRoleId identity specifically -- both checks
        // must miss before a dispatch proceeds.
        if (recipient.accountRoleId && this.flags.isEnabled('SCOPED_NOTIFICATION_DUAL_WRITE')) {
          const existingScopedLog = await this.logRepo.findOne({
            where: {
              eventType: params.eventType,
              sourceType: params.sourceType,
              sourceId: params.sourceId,
              recipientAccountRoleId: recipient.accountRoleId,
              channel,
            },
          });
          if (existingScopedLog) continue;
        }

        const template = await this.templateRepo.findOne({
          where: {
            eventType: params.eventType,
            channel,
            recipientRole: recipient.role,
            language: 'sw',
          },
        });

        if (!template) {
          await this.logRepo.save(
            this.logRepo.create({
              eventType: params.eventType,
              sourceType: params.sourceType,
              sourceId: params.sourceId,
              recipientUserId: recipient.userId,
              recipientRole: recipient.role,
              channel,
              templateId: null,
              status: 'skipped_no_template',
              errorMessage: null,
              ...audienceFields,
            }),
          );
          continue;
        }

        const title = this.render(template.titleTemplate, params.context);
        const body = this.render(template.bodyTemplate, params.context);

        await this.inAppNotifications.notify({
          userId: recipient.userId,
          type: params.eventType.toLowerCase(),
          title,
          body,
          actionPage: recipient.actionPage,
          actionParam: recipient.actionParam,
          orderId: params.sourceType === 'order' ? params.sourceId : undefined,
          ...(audienceFields.recipientAccountRoleId
            ? {
                audienceScope: audienceFields.audienceScope,
                recipientAccountRoleId: audienceFields.recipientAccountRoleId,
                recipientWorkspaceType: audienceFields.recipientWorkspaceType ?? undefined,
                recipientWorkspaceId: audienceFields.recipientWorkspaceId ?? undefined,
                sourceType: params.sourceType,
                sourceId: params.sourceId,
              }
            : {}),
        });

        await this.logRepo.save(
          this.logRepo.create({
            eventType: params.eventType,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            recipientUserId: recipient.userId,
            recipientRole: recipient.role,
            channel,
            templateId: template.id,
            status: 'sent',
            errorMessage: null,
            ...audienceFields,
          }),
        );
      } catch (err: any) {
        this.logger.warn(
          `Dispatch failed for ${params.eventType} recipient user #${recipient.userId}: ${err.message}`,
        );
        await this.logRepo
          .save(
            this.logRepo.create({
              eventType: params.eventType,
              sourceType: params.sourceType,
              sourceId: params.sourceId,
              recipientUserId: recipient.userId,
              recipientRole: recipient.role,
              channel,
              templateId: null,
              status: 'failed',
              errorMessage: String(err.message || err).slice(0, 255),
              ...audienceFields,
            }),
          )
          .catch(() => {});
      }
    }
  }
}
