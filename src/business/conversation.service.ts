/**
 * ConversationService — Unified Commerce Inbox
 *
 * Converts conversations into transactions.
 * Seller can: view messages, reply, share products,
 * create orders/invoices directly from the chat.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import {
  Conversation,
  ConversationStatus,
} from './entities/conversation.entity';
import {
  ConversationMessage,
  MessageSenderType,
  MessageType,
} from './entities/conversation-message.entity';
import { BusinessCustomer } from './entities/business-customer.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { BusinessCustomerService } from './business-customer.service';
import { User } from '../users/entities/user.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private convoRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private msgRepo: Repository<ConversationMessage>,
    @InjectRepository(BusinessCustomer)
    private customerRepo: Repository<BusinessCustomer>,
    @InjectRepository(BusinessTeamMember)
    private teamMemberRepo: Repository<BusinessTeamMember>,
    private customerService: BusinessCustomerService,
    private notifService: InAppNotificationService,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  // Batched — resolves whatever distinct commerceProfileIds appear among a
  // page of conversations in parallel, not one lookup per row. Attaches
  // {displayName, photoUrl} so the inbox can show the actual identity a
  // conversation concerns instead of always the seller's raw account name.
  // Conversations that predate this column (commerceProfileId null) simply
  // get commerceProfile: null — the caller falls back to raw fields.
  private async attachCommerceProfiles<T extends { commerceProfileId: number | null }>(
    conversations: T[],
  ): Promise<(T & { commerceProfile: { id: number; displayName: string; photoUrl: string | null } | null })[]> {
    const ids = [
      ...new Set(
        conversations.map((c) => c.commerceProfileId).filter((id): id is number => !!id),
      ),
    ];
    const profiles = await Promise.all(
      ids.map((id) => this.commerceProfiles.findById(id).catch(() => null)),
    );
    const profileMap = new Map(
      profiles.filter(Boolean).map((p) => [p!.id, p!]),
    );
    return conversations.map((c) => ({
      ...c,
      commerceProfile: c.commerceProfileId
        ? (() => {
            const p = profileMap.get(c.commerceProfileId!);
            return p ? { id: p.id, displayName: p.displayName, photoUrl: p.photoUrl } : null;
          })()
        : null,
    }));
  }

  // ── Get all conversations for seller ─────────────────────────────────────

  async getSellerInbox(
    sellerId: number,
    params: {
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.convoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .where('c.seller_id = :sellerId', { sellerId });

    if (params.status) {
      query.andWhere('c.status = :status', { status: params.status });
    }
    if (params.search) {
      query.andWhere('LOWER(customer.name) LIKE :q OR customer.phone LIKE :q', {
        q: `%${params.search.toLowerCase()}%`,
      });
    }

    const [conversations, total] = await query
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Unread count
    const unread = await this.convoRepo
      .createQueryBuilder('c')
      .where('c.seller_id = :sellerId', { sellerId })
      .andWhere('c.unreadCount > 0')
      .getCount();

    return {
      conversations: await this.attachCommerceProfiles(conversations),
      total,
      page,
      unread,
    };
  }

  // ── Get all conversations for a buyer (as the customer, across sellers) ──

  async getMyConversations(
    userId: number,
    params: {
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.convoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.seller', 'seller')
      .where('customer.user_id = :userId', { userId });

    const [conversations, total] = await query
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const unread = await this.convoRepo
      .createQueryBuilder('c')
      .leftJoin('c.customer', 'customer')
      .where('customer.user_id = :userId', { userId })
      .andWhere('c.buyerUnreadCount > 0')
      .getCount();

    return {
      conversations: await this.attachCommerceProfiles(conversations),
      total,
      page,
      unread,
    };
  }

  // ── Get or create conversation ────────────────────────────────────────────

  async getOrCreateConversation(
    sellerId: number,
    customerId: number,
    commerceProfileId?: number | null,
  ): Promise<Conversation> {
    // Never trust a client-supplied commerceProfileId blindly — must
    // actually belong to this seller, same authorization posture as
    // FeedService.publish()/ClassifiedsService.create(). An id that
    // doesn't check out is silently dropped rather than rejecting the
    // whole message — the conversation still opens, just without a
    // specific identity attached (same as messaging with no context).
    // Verified up front (not just at creation time) because the lookup
    // below must key on the same verified value, or a caller could smuggle
    // an unverified id into matching/creating a thread it shouldn't.
    let verifiedProfileId: number | null = null;
    if (commerceProfileId) {
      const profile = await this.commerceProfiles
        .findById(commerceProfileId)
        .catch(() => null);
      if (profile && profile.ownerId === sellerId) {
        verifiedProfileId = commerceProfileId;
      }
    }

    // Was missing commerceProfileId here — the entity's own comment already
    // documents the intent ("must land in two conversations that each show
    // the correct identity"), but this lookup ignored it, so a buyer
    // messaging the seller's personal profile and, separately, their
    // business profile got silently merged into whichever conversation was
    // already OPEN: messages meant for one identity showed up under the
    // other's inbox.
    let convo = await this.convoRepo.findOne({
      where: {
        sellerId,
        customerId,
        status: ConversationStatus.OPEN,
        commerceProfileId: verifiedProfileId === null ? IsNull() : verifiedProfileId,
      },
      // "seller" is needed so the buyer-side chat header can show the real
      // business name instead of a generic placeholder on first load.
      relations: { customer: true, seller: true },
    });

    if (!convo) {
      const customer = await this.customerRepo.findOne({
        where: { id: customerId, sellerId },
        relations: { seller: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      convo = this.convoRepo.create({
        sellerId,
        customerId,
        status: ConversationStatus.OPEN,
        channel: customer.channel || 'kentexa',
        subject: `Mazungumzo na ${customer.name}`,
        commerceProfileId: verifiedProfileId,
      });
      convo = await this.convoRepo.save(convo);
      convo.customer = customer;
      convo.seller = customer.seller;
    }

    return convo;
  }

  // ── Get or create conversation, initiated by a BUYER ──────────────────────
  // No BusinessCustomer row is required up front — auto-created on first
  // contact, same as when an order comes in, just without the order stats.

  async getOrCreateConversationAsBuyer(
    buyer: User,
    sellerId: number,
    commerceProfileId?: number | null,
  ): Promise<Conversation> {
    if (sellerId === buyer.id) {
      throw new BadRequestException('Cannot message yourself');
    }

    const customer = await this.customerService.findOrCreateForChat(sellerId, {
      id: buyer.id,
      name: buyer.name || buyer.storeName || 'Mnunuzi',
      phone: buyer.phone,
      email: buyer.email,
    });

    return this.getOrCreateConversation(sellerId, customer.id, commerceProfileId);
  }

  // ── Get messages in a conversation ───────────────────────────────────────

  async getMessages(sellerId: number, conversationId: number) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
      relations: { customer: true, assignedTo: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const messages = await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    // Mark as read
    await this.convoRepo.update(conversationId, { unreadCount: 0 });

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages };
  }

  // ── Get messages in a conversation, as the BUYER ──────────────────────────

  async getMessagesAsBuyer(userId: number, conversationId: number) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true, seller: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = await this.msgRepo.find({
      where: { conversationId, isNote: false },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    await this.convoRepo.update(conversationId, { buyerUnreadCount: 0 });

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages };
  }

  // ── Send a message ────────────────────────────────────────────────────────

  async sendMessage(
    sellerId: number,
    conversationId: number,
    dto: {
      content?: string;
      imageUrl?: string;
      isNote?: boolean; // internal note
      type?: string;
      metadata?: any;
    },
    sender: User,
  ): Promise<ConversationMessage> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
      relations: { customer: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const msg = this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.SELLER,
      senderId: sender.id,
      type: dto.type || MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
      metadata: dto.metadata || null,
      isNote: dto.isNote || false,
    });
    await this.msgRepo.save(msg);

    // Update conversation — internal notes aren't visible to the buyer, so
    // they don't touch lastMessage*/buyerUnreadCount, only messageCount.
    await this.convoRepo.update(
      conversationId,
      dto.isNote
        ? {
            messageCount: () => '"messageCount" + 1',
          }
        : {
            lastMessageAt: new Date(),
            lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
            status: ConversationStatus.PENDING,
            messageCount: () => '"messageCount" + 1',
            buyerUnreadCount: () => '"buyerUnreadCount" + 1',
          },
    );

    // Notify the buyer — internal notes are seller-only, never surfaced.
    // "MessageSeller-{sellerId}" is the exact route SellerInbox.js already
    // uses to open this conversation as the buyer. The conversation's own
    // commerceProfileId (the identity this thread concerns) wins over the
    // seller's raw account fields when set — a personal-profile classified
    // conversation shouldn't show the business brand, or vice versa.
    if (!dto.isNote && convo.customer?.userId) {
      const senderProfile = convo.commerceProfileId
        ? await this.commerceProfiles.findById(convo.commerceProfileId).catch(() => null)
        : null;
      this.notifService
        .notify({
          userId: convo.customer.userId,
          type: 'message',
          title: `💬 ${senderProfile?.displayName || sender.storeName || sender.name || 'Muuzaji'}`,
          body: dto.content?.slice(0, 80) || '📷 Picha',
          icon: '💬',
          actionPage: 'MessageSeller',
          actionParam: String(sellerId),
        })
        .catch(() => {});
    }

    return msg;
  }

  // ── Send a message, as the BUYER ──────────────────────────────────────────

  async sendMessageAsBuyer(
    userId: number,
    conversationId: number,
    dto: {
      content?: string;
      imageUrl?: string;
    },
    sender: User,
  ): Promise<ConversationMessage> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const msg = this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.CUSTOMER,
      senderId: sender.id,
      type: MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
    });
    await this.msgRepo.save(msg);

    await this.convoRepo.update(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
      status: ConversationStatus.OPEN, // seller needs to respond
      messageCount: () => '"messageCount" + 1',
      unreadCount: () => '"unreadCount" + 1',
    });

    // Notify the seller — "SellerInbox-{customerId}" is the exact route
    // SellerInbox.js already uses to auto-open this conversation.
    this.notifService
      .notify({
        userId: convo.sellerId,
        type: 'message',
        title: `💬 ${sender.name || sender.storeName || 'Mnunuzi'}`,
        body: dto.content?.slice(0, 80) || '📷 Picha',
        icon: '💬',
        actionPage: 'SellerInbox',
        actionParam: String(convo.customer.id),
      })
      .catch(() => {});

    return msg;
  }

  // ── Share product in chat ─────────────────────────────────────────────────

  async shareProduct(
    sellerId: number,
    conversationId: number,
    product: {
      id: number;
      name: string;
      price: number;
      image?: string;
    },
    sender: User,
  ): Promise<ConversationMessage> {
    return this.sendMessage(
      sellerId,
      conversationId,
      {
        type: MessageType.PRODUCT,
        content: `Bidhaa: ${product.name} — TZS ${product.price.toLocaleString()}`,
        metadata: {
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
          productImage: product.image,
        },
      },
      sender,
    );
  }

  // ── Create order from chat ────────────────────────────────────────────────
  // Adds a system message to the conversation after order is created

  async addOrderMessage(
    conversationId: number,
    order: {
      id: number;
      trackingNumber: string;
      totalAmount: number;
      status: string;
    },
  ): Promise<void> {
    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: MessageSenderType.SYSTEM,
        type: MessageType.ORDER,
        content: `Agizo #${order.id} limeundwa — TZS ${order.totalAmount.toLocaleString()}`,
        metadata: {
          orderId: order.id,
          trackingNumber: order.trackingNumber,
          orderStatus: order.status,
        },
      }),
    );

    await this.convoRepo.update(conversationId, {
      linkedOrderId: order.id,
      lastMessageAt: new Date(),
      lastMessagePreview: `📦 Agizo limeundwa — TZS ${order.totalAmount.toLocaleString()}`,
      messageCount: () => '"messageCount" + 1',
    });
  }

  // ── Update conversation status ────────────────────────────────────────────

  async updateStatus(
    sellerId: number,
    conversationId: number,
    status: string,
  ): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.status = status;
    return this.convoRepo.save(convo);
  }

  // ── Assign conversation to team member ────────────────────────────────────

  async assignTo(
    sellerId: number,
    conversationId: number,
    assignedToId: number,
  ): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    // Previously accepted any user ID with no check it was actually part
    // of this seller's team.
    const isTeamMember = await this.teamMemberRepo.findOne({
      where: { sellerId, userId: assignedToId, isActive: true },
    });
    if (!isTeamMember) {
      throw new BadRequestException(
        'That user is not an active member of your team',
      );
    }

    convo.assignedToId = assignedToId;

    // System message
    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: MessageSenderType.SYSTEM,
        type: MessageType.TEXT,
        content: `Mazungumzo yamepewa mwanachama wa timu.`,
      }),
    );

    return this.convoRepo.save(convo);
  }
}
