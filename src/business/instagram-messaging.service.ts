import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstagramBusinessConnection, InstagramBusinessConnectionStatus } from './entities/instagram-business-connection.entity';
import { InstagramBusinessContact } from './entities/instagram-business-contact.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage, MessageSenderType } from './entities/conversation-message.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { InstagramTokenCryptoService } from './instagram-token-crypto.service';
import { ConfigService } from '@nestjs/config';

/**
 * Outbound Instagram text delivery for the existing Unified Inbox composer.
 * The caller has already authorized the seller/workspace conversation.
 */
@Injectable()
export class InstagramMessagingService {
  constructor(
    @InjectRepository(InstagramBusinessConnection) private readonly connections: Repository<InstagramBusinessConnection>,
    @InjectRepository(InstagramBusinessContact) private readonly contacts: Repository<InstagramBusinessContact>,
    @InjectRepository(ConversationMessage) private readonly messages: Repository<ConversationMessage>,
    @InjectRepository(SellerProfile) private readonly sellers: Repository<SellerProfile>,
    private readonly crypto: InstagramTokenCryptoService,
    private readonly config: ConfigService,
  ) {}

  async deliverText(conversation: Conversation, text: string): Promise<string> {
    const content = String(text || '').trim();
    if (!content) throw new BadRequestException('Message text is required.');
    if (content.length > 1000) throw new BadRequestException('Instagram text messages are limited to 1,000 characters.');

    const match = /^instagram:(\d+):(\d{1,128})$/.exec(conversation.externalId || '');
    if (conversation.channel !== 'instagram' || !match || !conversation.customerId) {
      throw new NotFoundException('Instagram conversation not found.');
    }
    const connectionId = Number(match[1]);
    const instagramScopedUserId = match[2];

    const sellerProfile = conversation.ownerWorkspaceType === 'seller_profile' && conversation.ownerWorkspaceId
      ? await this.sellers.findOne({ where: { id: conversation.ownerWorkspaceId, userId: conversation.sellerId } })
      : null;
    if (!sellerProfile || !sellerProfile.businessId) {
      throw new NotFoundException('Instagram conversation workspace not found.');
    }

    const connection = await this.connections.createQueryBuilder('connection')
      .addSelect('connection.accessTokenEncrypted')
      .where('connection.id = :connectionId', { connectionId })
      .andWhere('connection.businessId = :businessId', { businessId: sellerProfile.businessId })
      .andWhere('connection.status = :status', { status: InstagramBusinessConnectionStatus.ACTIVE })
      .getOne();
    if (!connection?.accessTokenEncrypted) {
      throw new ServiceUnavailableException('The Instagram account is disconnected or requires reconnection.');
    }

    const contact = await this.contacts.findOne({
      where: { connectionId, businessCustomerId: conversation.customerId, instagramScopedUserId },
    });
    if (!contact) throw new NotFoundException('Instagram recipient mapping not found.');

    const latestInbound = await this.messages.findOne({
      where: { conversationId: conversation.id, senderType: MessageSenderType.CUSTOMER, isNote: false },
      order: { createdAt: 'DESC' },
    });
    if (!latestInbound || Date.now() - new Date(latestInbound.createdAt).getTime() > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Instagram replies are available only within 24 hours of the customer’s latest message.');
    }

    // Facebook Login: an Instagram message goes out through the linked Page, with the Page access
    // token (Meta: Instagram Messaging, Send a message: POST /{page-id}/messages). A connection
    // made the old way has no Page: it must be reconnected (owner 2026-11-09).
    if (!connection.facebookPageId) {
      await this.connections.update(connection.id, { status: InstagramBusinessConnectionStatus.REAUTH_REQUIRED });
      throw new ServiceUnavailableException('Unganisha Instagram tena (Business integrations) ili kujibu ujumbe.');
    }
    const version = this.config.get<string>('META_GRAPH_API_VERSION') || 'v26.0';
    const url = 'https://graph.facebook.com/' + version + '/' + connection.facebookPageId + '/messages?access_token='
      + encodeURIComponent(this.crypto.decrypt(connection.accessTokenEncrypted));
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: instagramScopedUserId }, message: { text: content } }),
      });
    } catch {
      throw new ServiceUnavailableException('Instagram could not be reached. Your message was not sent.');
    }

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.message_id) {
      // Never surface Meta response bodies: they can contain request details.
      // An invalid or expired token is Meta error code 190 (OAuthException), usually HTTP 400.
      if (response.status === 401 || response.status === 403 || Number(payload?.error?.code) === 190) {
        await this.connections.update(connection.id, { status: InstagramBusinessConnectionStatus.REAUTH_REQUIRED });
        throw new ServiceUnavailableException('Instagram authorization needs to be renewed.');
      }
      throw new BadGatewayException('Instagram did not accept the message. Please try again.');
    }
    return String(payload.message_id);
  }
}
