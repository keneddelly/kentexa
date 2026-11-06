import { Injectable, BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { InstagramWebhookEvent } from './entities/instagram-webhook-event.entity';
import { InstagramBusinessConnection, InstagramBusinessConnectionStatus } from './entities/instagram-business-connection.entity';
import { InstagramBusinessContactService } from './instagram-business-contact.service';
import { ConversationService } from './conversation.service';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: Array<{ type?: string; payload?: { url?: string; title?: string } }>;
    is_echo?: boolean;
  };
};

@Injectable()
export class InstagramWebhookIngestionService {
  private readonly logger = new Logger(InstagramWebhookIngestionService.name);

  constructor(
    @InjectRepository(InstagramWebhookEvent)
    private readonly events: Repository<InstagramWebhookEvent>,
    @InjectRepository(InstagramBusinessConnection)
    private readonly connections: Repository<InstagramBusinessConnection>,
    @InjectRepository(SellerProfile)
    private readonly sellers: Repository<SellerProfile>,
    private readonly contacts: InstagramBusinessContactService,
    private readonly conversations: ConversationService,
  ) {}

  /**
   * Persist the signed delivery first, then route inbound DMs into the same
   * conversation/message tables used by Kentexa's Unified Inbox.
   */
  async accept(rawBody: Buffer): Promise<{ duplicate: boolean }> {
    let payload: Record<string, any>;
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON object.');
      payload = parsed as Record<string, any>;
    } catch {
      throw new BadRequestException('Instagram webhook body must be a valid JSON object.');
    }

    if (payload.object !== 'instagram' || !Array.isArray(payload.entry)) {
      throw new BadRequestException('Unsupported Instagram webhook payload.');
    }

    const eventHash = createHash('sha256').update(rawBody).digest('hex');
    const insert = await this.events.createQueryBuilder().insert().values({
      eventHash,
      objectType: payload.object,
      payload,
      processingStatus: 'received',
      processingAttempts: 0,
      processingError: null,
      processedAt: null,
    }).orIgnore().execute();

    const event = await this.events.findOne({ where: { eventHash } });
    if (!event) throw new ServiceUnavailableException('Instagram webhook could not be durably stored.');
    if (event.processingStatus === 'processed') {
      return { duplicate: true };
    }

    // Atomically claim the delivery. A second concurrent webhook cannot
    // process the same event while this lease is fresh. A worker crash does
    // not strand the event forever: after five minutes a redelivery may
    // reclaim the lease and retry it.
    const claim = await this.events.createQueryBuilder()
      .update(InstagramWebhookEvent)
      .set({
        processingStatus: 'processing',
        processingAttempts: () => '"processingAttempts" + 1',
        processingError: null,
        processingStartedAt: () => 'NOW()',
      })
      .where(
        `id = :id AND (
          "processingStatus" IN (:...retryable)
          OR ("processingStatus" = :processing AND "processingStartedAt" < NOW() - INTERVAL '5 minutes')
        )`,
        { id: event.id, retryable: ['received', 'failed'], processing: 'processing' },
      )
      .returning(['id'])
      .execute();

    if (!claim.raw?.length) {
      // Another request owns the fresh lease, or the event was already done.
      return { duplicate: true };
    }

    try {
      await this.processPayload(payload);
      await this.events.update(event.id, {
        processingStatus: 'processed',
        processingError: null,
        processedAt: new Date(),
        processingStartedAt: null,
      });
    } catch (error) {
      await this.events.update(event.id, {
        processingStatus: 'failed',
        processingError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown processing error',
        processingStartedAt: null,
      });
      this.logger.error(`Instagram event ${event.id} persisted but processing failed.`);
      throw new ServiceUnavailableException('Instagram message was stored and will be retried.');
    }
    return { duplicate: insert.identifiers.length === 0 };
  }

  private async processPayload(payload: Record<string, any>): Promise<void> {
    for (const entry of payload.entry as Array<Record<string, any>>) {
      const instagramBusinessId = String(entry?.id || '');
      if (!/^\d{1,128}$/.test(instagramBusinessId)) continue;
      const connection = await this.connections.findOne({
        where: { instagramUserId: instagramBusinessId, status: InstagramBusinessConnectionStatus.ACTIVE },
      });
      if (!connection) continue;

      const sellerProfiles = await this.sellers.find({
        where: { businessId: connection.businessId, status: SellerStatus.APPROVED },
        order: { id: 'ASC' },
      });
      if (sellerProfiles.length !== 1 || !sellerProfiles[0]?.userId) {
        throw new Error(`Instagram Business ${connection.businessId} must resolve to exactly one approved SellerProfile; found ${sellerProfiles.length}. Webhook remains retryable.`);
      }
      const seller = sellerProfiles[0];

      const messages = Array.isArray(entry.messaging) ? entry.messaging as InstagramMessagingEvent[] : [];
      for (const item of messages) {
        if (item.message?.is_echo) continue;
        const senderId = String(item.sender?.id || '');
        const messageId = String(item.message?.mid || '');
        if (!/^\d{1,128}$/.test(senderId) || !messageId) continue;
        // Do not ingest self-messages or malformed recipient envelopes.
        if (senderId === instagramBusinessId || (item.recipient?.id && String(item.recipient.id) !== instagramBusinessId)) continue;

        const attachments = Array.isArray(item.message?.attachments) ? item.message!.attachments! : [];
        const attachmentSummary = attachments.length
          ? attachments.map(a => a.type || 'attachment').join(', ')
          : null;
        const contact = await this.contacts.findOrCreate({
          connectionId: connection.id,
          sellerId: seller.userId,
          instagramScopedUserId: senderId,
        });
        await this.conversations.receiveInstagramMessage({
          sellerId: seller.userId,
          customerId: contact.businessCustomerId,
          connectionId: connection.id,
          ownerWorkspaceOverride: { ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: seller.id },
          instagramScopedUserId: senderId,
          externalMessageId: messageId,
          text: typeof item.message?.text === 'string' ? item.message.text : null,
          attachmentSummary,
        });
      }
    }
  }
}
