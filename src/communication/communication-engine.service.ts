import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationTemplate } from './entities/communication-template.entity';
import { CommunicationLog } from './entities/communication-log.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';

export interface DispatchRecipient {
  userId: number;
  role: string;
  actionPage?: string;
  actionParam?: string;
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
    private inAppNotifications: InAppNotificationService,
  ) {}

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
    for (const recipient of params.recipients) {
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
            }),
          )
          .catch(() => {});
      }
    }
  }
}
