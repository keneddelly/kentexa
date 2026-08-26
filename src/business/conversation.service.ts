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
import { Repository } from 'typeorm';
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
import { BusinessCustomerService } from './business-customer.service';
import { User } from '../users/entities/user.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ConversationGateway } from './conversation.gateway';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private convoRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private msgRepo: Repository<ConversationMessage>,
    @InjectRepository(BusinessCustomer)
    private customerRepo: Repository<BusinessCustomer>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private customerService: BusinessCustomerService,
    private notifService: InAppNotificationService,
    private gateway: ConversationGateway,
    private whatsappService: WhatsappService,
    private eventEmitter: EventEmitter2,
  ) {}

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

    return { conversations, total, page, unread };
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

    return { conversations, total, page, unread };
  }

  // ── Get or create conversation ────────────────────────────────────────────

  async getOrCreateConversation(
    sellerId: number,
    customerId: number,
  ): Promise<Conversation> {
    // Look up by seller+customer only — NOT status. Filtering on
    // status:OPEN here meant that once a conversation was resolved or
    // closed, the buyer's very next message would silently create a
    // brand new conversation instead of reopening the old one, leaving
    // the seller with duplicate threads for the same customer.
    let convo = await this.convoRepo.findOne({
      where: { sellerId, customerId },
      order: { createdAt: 'DESC' },
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
      });
      convo = await this.convoRepo.save(convo);
      convo.customer = customer;
      convo.seller = customer.seller;
    } else if (
      convo.status === ConversationStatus.RESOLVED ||
      convo.status === ConversationStatus.CLOSED
    ) {
      // Reopen rather than duplicate.
      convo.status = ConversationStatus.OPEN;
      convo = await this.convoRepo.save(convo);
    }

    return convo;
  }

  // ── Get or create conversation, initiated by a BUYER ──────────────────────
  // No BusinessCustomer row is required up front — auto-created on first
  // contact, same as when an order comes in, just without the order stats.

  async getOrCreateConversationAsBuyer(
    buyer: User,
    sellerId: number,
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

    return this.getOrCreateConversation(sellerId, customer.id);
  }

  // ── Link a service booking to its conversation ────────────────────────────
  async linkJobRequest(
    conversationId: number,
    jobRequestId: number,
  ): Promise<void> {
    await this.convoRepo.update(conversationId, {
      linkedJobRequestId: jobRequestId,
    });
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

    return { conversation: convo, messages };
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

    return { conversation: convo, messages };
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

    this.eventEmitter.emit('message.sent', {
      conversationId,
      sellerId,
      senderId: sender.id,
      isNote: !!dto.isNote,
    });

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
    // uses to open this conversation as the buyer.
    if (!dto.isNote && convo.customer?.userId) {
      this.notifService
        .notify({
          userId: convo.customer.userId,
          type: 'message',
          title: `💬 ${sender.storeName || sender.name || 'Muuzaji'}`,
          body: dto.content?.slice(0, 80) || '📷 Picha',
          icon: '💬',
          actionPage: 'MessageSeller',
          actionParam: String(sellerId),
        })
        .catch(() => {});
    }

    if (!dto.isNote) {
      this.gateway.emitNewMessage(
        conversationId,
        sellerId,
        convo.customer?.userId ?? null,
        msg,
      );
    }

    // ── Relay out to WhatsApp — this conversation IS the customer's real
    // WhatsApp thread, so a reply here must actually reach their phone,
    // not just live in KenteXa's database.
    // TODO: outside the 24h customer-service window WhatsApp rejects
    // free-form text and requires a pre-approved template message instead —
    // not yet implemented, so late replies will silently fail to deliver
    // (the message still saves locally either way).
    if (
      !dto.isNote &&
      dto.content &&
      convo.channel === 'whatsapp' &&
      sender.whatsappPhoneNumberId &&
      sender.whatsappAccessToken
    ) {
      const toWaId = convo.externalId || convo.customer?.phone;
      if (toWaId) {
        this.whatsappService
          .sendTextMessage(
            sender.whatsappPhoneNumberId,
            sender.whatsappAccessToken,
            toWaId,
            dto.content,
          )
          .catch(() => {});
      }
    }

    return msg;
  }

  // ── Receive a message from an external channel (WhatsApp etc) ────────────
  // No KenteXa User account exists for the customer here — they're
  // identified purely by phone number / the channel's own contact id.

  async receiveExternalMessage(
    sellerId: number,
    contact: {
      phone: string;
      name?: string | null;
      channel: string;
      externalId: string;
    },
    dto: { content?: string; imageUrl?: string; type?: string },
  ): Promise<ConversationMessage> {
    const customer = await this.customerService.findOrCreateForExternalChat(
      sellerId,
      { phone: contact.phone, name: contact.name, channel: contact.channel },
    );

    const convo = await this.getOrCreateConversation(sellerId, customer.id);
    if (convo.externalId !== contact.externalId) {
      await this.convoRepo.update(convo.id, {
        externalId: contact.externalId,
      });
    }

    const msg = this.msgRepo.create({
      conversationId: convo.id,
      senderType: MessageSenderType.CUSTOMER,
      senderId: null,
      type: (dto.type as any) || MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
    });
    await this.msgRepo.save(msg);

    await this.convoRepo.update(convo.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
      status: ConversationStatus.OPEN, // seller needs to respond
      messageCount: () => '"messageCount" + 1',
      unreadCount: () => '"unreadCount" + 1',
    });

    this.notifService
      .notify({
        userId: sellerId,
        type: 'message',
        title: `💬 ${contact.name || contact.phone} (WhatsApp)`,
        body: dto.content?.slice(0, 80) || '📷 Picha',
        icon: '💬',
        actionPage: 'SellerInbox',
        actionParam: String(customer.id),
      })
      .catch(() => {});

    this.gateway.emitNewMessage(convo.id, sellerId, null, msg);

    return msg;
  }

  // ── Send a message, as the BUYER ──────────────────────────────────────────

  async sendMessageAsBuyer(
    userId: number,
    conversationId: number,
    dto: {
      content?: string;
      imageUrl?: string;
      type?: string;
      metadata?: any;
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
      type: (dto.type as any) || MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
      metadata: dto.metadata || null,
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

    this.gateway.emitNewMessage(conversationId, convo.sellerId, userId, msg);

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

  // ── Share a service listing in chat ───────────────────────────────────────

  async shareService(
    sellerId: number,
    conversationId: number,
    service: {
      id: number;
      title: string;
      price?: number;
      image?: string;
    },
    sender: User,
  ): Promise<ConversationMessage> {
    return this.sendMessage(
      sellerId,
      conversationId,
      {
        type: MessageType.SERVICE,
        content: `Huduma: ${service.title}`,
        metadata: {
          serviceId: service.id,
          serviceTitle: service.title,
          servicePrice: service.price,
          serviceImage: service.image,
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

  // ── WhatsApp connection settings (per-seller number) ──────────────────────

  async getWhatsappConnectionStatus(sellerId: number): Promise<{
    connected: boolean;
    phoneNumberId: string | null;
  }> {
    const user = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      connected: !!(user.whatsappPhoneNumberId && user.whatsappAccessToken),
      phoneNumberId: user.whatsappPhoneNumberId,
    };
  }

  async setWhatsappConnection(
    sellerId: number,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ connected: boolean }> {
    if (!phoneNumberId?.trim() || !accessToken?.trim()) {
      throw new BadRequestException('Phone number ID and access token are required');
    }
    await this.userRepo.update(sellerId, {
      whatsappPhoneNumberId: phoneNumberId.trim(),
      whatsappAccessToken: accessToken.trim(),
    });
    return { connected: true };
  }

  async disconnectWhatsapp(sellerId: number): Promise<{ connected: boolean }> {
    await this.userRepo.update(sellerId, {
      whatsappPhoneNumberId: null,
      whatsappAccessToken: null,
    });
    return { connected: false };
  }
}
