/**
 * ConversationService — Unified Commerce Inbox
 *
 * Converts conversations into transactions.
 * Seller can: view messages, reply, share products,
 * create orders/invoices directly from the chat.
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from './entities/conversation.entity';
import { ConversationMessage, MessageSenderType, MessageType } from './entities/conversation-message.entity';
import { BusinessCustomer } from './entities/business-customer.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private convoRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private msgRepo: Repository<ConversationMessage>,
    @InjectRepository(BusinessCustomer)
    private customerRepo: Repository<BusinessCustomer>,
  ) {}

  // ── Get all conversations for seller ─────────────────────────────────────

  async getSellerInbox(sellerId: number, params: {
    status?:  string;
    search?:  string;
    page?:    number;
    limit?:   number;
  }) {
    const page  = params.page  || 1;
    const limit = params.limit || 20;
    const skip  = (page - 1) * limit;

    const query = this.convoRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .where('c.seller_id = :sellerId', { sellerId });

    if (params.status) {
      query.andWhere('c.status = :status', { status: params.status });
    }
    if (params.search) {
      query.andWhere('LOWER(customer.name) LIKE :q OR customer.phone LIKE :q',
        { q: `%${params.search.toLowerCase()}%` });
    }

    const [conversations, total] = await query
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip).take(limit)
      .getManyAndCount();

    // Unread count
    const unread = await this.convoRepo
      .createQueryBuilder('c')
      .where('c.seller_id = :sellerId', { sellerId })
      .andWhere('c.unreadCount > 0')
      .getCount();

    return { conversations, total, page, unread };
  }

  // ── Get or create conversation ────────────────────────────────────────────

  async getOrCreateConversation(sellerId: number, customerId: number): Promise<Conversation> {
    let convo = await this.convoRepo.findOne({
      where: {
        sellerId,
        customerId,
        status: ConversationStatus.OPEN,
      },
      relations: { customer: true },
    });

    if (!convo) {
      const customer = await this.customerRepo.findOne({
        where: { id: customerId, sellerId },
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
    }

    return convo;
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

  // ── Send a message ────────────────────────────────────────────────────────

  async sendMessage(sellerId: number, conversationId: number, dto: {
    content?:  string;
    imageUrl?: string;
    isNote?:   boolean;    // internal note
    type?:     string;
    metadata?: any;
  }, sender: User): Promise<ConversationMessage> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const msg = this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.SELLER,
      senderId:   sender.id,
      type:       dto.type    || MessageType.TEXT,
      content:    dto.content || null,
      imageUrl:   dto.imageUrl || null,
      metadata:   dto.metadata || null,
      isNote:     dto.isNote  || false,
    });
    await this.msgRepo.save(msg);

    // Update conversation
    await this.convoRepo.update(conversationId, {
      lastMessageAt:      new Date(),
      lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
      status:             ConversationStatus.PENDING,
      messageCount:       () => '"messageCount" + 1',
    });

    return msg;
  }

  // ── Share product in chat ─────────────────────────────────────────────────

  async shareProduct(sellerId: number, conversationId: number, product: {
    id: number; name: string; price: number; image?: string;
  }, sender: User): Promise<ConversationMessage> {
    return this.sendMessage(sellerId, conversationId, {
      type:    MessageType.PRODUCT,
      content: `Bidhaa: ${product.name} — TZS ${product.price.toLocaleString()}`,
      metadata: {
        productId:    product.id,
        productName:  product.name,
        productPrice: product.price,
        productImage: product.image,
      },
    }, sender);
  }

  // ── Create order from chat ────────────────────────────────────────────────
  // Adds a system message to the conversation after order is created

  async addOrderMessage(conversationId: number, order: {
    id: number; trackingNumber: string; totalAmount: number; status: string;
  }): Promise<void> {
    await this.msgRepo.save(this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.SYSTEM,
      type:       MessageType.ORDER,
      content:    `Agizo #${order.id} limeundwa — TZS ${order.totalAmount.toLocaleString()}`,
      metadata: {
        orderId:        order.id,
        trackingNumber: order.trackingNumber,
        orderStatus:    order.status,
      },
    }));

    await this.convoRepo.update(conversationId, {
      linkedOrderId:      order.id,
      lastMessageAt:      new Date(),
      lastMessagePreview: `📦 Agizo limeundwa — TZS ${order.totalAmount.toLocaleString()}`,
      messageCount:       () => '"messageCount" + 1',
    });
  }

  // ── Update conversation status ────────────────────────────────────────────

  async updateStatus(sellerId: number, conversationId: number,
    status: string): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.status = status;
    return this.convoRepo.save(convo);
  }

  // ── Assign conversation to team member ────────────────────────────────────

  async assignTo(sellerId: number, conversationId: number,
    assignedToId: number): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.assignedToId = assignedToId;

    // System message
    await this.msgRepo.save(this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.SYSTEM,
      type:       MessageType.TEXT,
      content:    `Mazungumzo yamepewa mwanachama wa timu.`,
    }));

    return this.convoRepo.save(convo);
  }
}