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
import { Repository, IsNull, LessThan } from 'typeorm';
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
import { ConversationGateway } from './conversation.gateway';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';

export interface ConversationContext {
  type: 'product' | 'classified' | 'service';
  id: number;
}

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
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
    @InjectRepository(ServiceAd)
    private serviceAdRepo: Repository<ServiceAd>,
    private customerService: BusinessCustomerService,
    private notifService: InAppNotificationService,
    private commerceProfiles: CommerceProfilesService,
    private gateway: ConversationGateway,
  ) {}

  // Never trust a client-supplied contextId blindly — same posture as
  // verifiedProfileId in getOrCreateConversation below: the listing must
  // actually belong to this seller, or the context is silently dropped
  // (the conversation still opens, just without a tag) rather than
  // rejecting the whole "message seller" action over it.
  private async resolveContext(
    sellerId: number,
    context?: ConversationContext | null,
  ): Promise<{ type: string; id: number; title: string; image: string | null; price: number } | null> {
    if (!context?.type || !context?.id) return null;
    if (context.type === 'product') {
      const p = await this.productRepo.findOne({
        where: { id: context.id, seller: { id: sellerId } },
      });
      if (!p) return null;
      return { type: 'product', id: p.id, title: p.name, image: p.images?.[0] || null, price: Number(p.displayPrice || p.basePrice || 0) };
    }
    if (context.type === 'classified') {
      const c = await this.classifiedRepo.findOne({
        where: { id: context.id, seller: { id: sellerId } },
      });
      if (!c) return null;
      return { type: 'classified', id: c.id, title: c.title, image: c.images?.[0] || null, price: Number(c.price || 0) };
    }
    if (context.type === 'service') {
      const s = await this.serviceAdRepo.findOne({
        where: { id: context.id, providerId: sellerId },
      });
      if (!s) return null;
      return { type: 'service', id: s.id, title: s.title, image: s.images?.[0] || null, price: Number(s.price || 0) };
    }
    return null;
  }

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
      assignedToId?: number;
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
    // "Assigned to me" — a team member's own working view of the shared
    // business inbox, not a separate inbox: same conversations, filtered.
    if (params.assignedToId) {
      // assignedToId's @Column has an explicit `name: 'assigned_to_id'`
      // override (unlike sellerPinned/buyerPinned above, which keep their
      // camelCase property name as the literal DB column) — raw
      // querybuilder conditions address the actual column, not the TS
      // property name, so this must use the snake_case form.
      query.andWhere('c.assigned_to_id = :assignedToId', {
        assignedToId: params.assignedToId,
      });
    }

    const [conversations, total] = await query
      .orderBy('c.sellerPinned', 'DESC')
      .addOrderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
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
      search?: string;
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

    if (params.search) {
      query.andWhere(
        '(LOWER(seller.storeName) LIKE :q OR LOWER(seller.name) LIKE :q)',
        { q: `%${params.search.toLowerCase()}%` },
      );
    }

    const [conversations, total] = await query
      .orderBy('c.buyerPinned', 'DESC')
      .addOrderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
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

  // ── Combined unread-conversation count (seller side + buyer side) ────────
  // The one number that should feed EVERY unread-inbox badge in the app
  // (bottom nav, header icon) — a user can be both a seller receiving
  // messages and a buyer messaging other sellers, and previously nothing
  // combined those two counts, let alone did it from conversation data at
  // all (existing badges read the unrelated generic Notification-unread
  // count instead, which drifts — see markReadByAction's own comment).
  // sellerActorId and buyerUserId are deliberately separate params — a team
  // member's "seller side" unread count belongs to the business they act
  // for (resolveSellerActorId's delegation), but their "buyer side" unread
  // count (messages they sent to OTHER sellers) is always their own raw
  // account, never the business they're delegated on.
  async getUnreadConversationCount(
    sellerActorId: number,
    buyerUserId: number,
  ): Promise<number> {
    // Muted threads keep their own per-conversation unread indicator (still
    // visible once inside the Inbox) but deliberately don't add to this
    // combined count — the one that drives the app-wide badge — matching
    // the whole point of muting a conversation.
    const [asSeller, asBuyer] = await Promise.all([
      this.convoRepo
        .createQueryBuilder('c')
        .where('c.seller_id = :sellerActorId', { sellerActorId })
        .andWhere('c.unreadCount > 0')
        .andWhere('c.sellerMuted = false')
        .getCount(),
      this.convoRepo
        .createQueryBuilder('c')
        .leftJoin('c.customer', 'customer')
        .where('customer.user_id = :buyerUserId', { buyerUserId })
        .andWhere('c.buyerUnreadCount > 0')
        .andWhere('c.buyerMuted = false')
        .getCount(),
    ]);
    return asSeller + asBuyer;
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
      try {
        convo = await this.convoRepo.save(convo);
        convo.customer = customer;
        convo.seller = customer.seller;
      } catch (err: any) {
        // 23505 = unique_violation on the partial indexes above — a
        // concurrent request (double-tap, retry-on-timeout) won the race
        // and already created the matching conversation. Not an error from
        // the caller's point of view: re-fetch and hand back that row
        // instead of throwing, exactly like a normal find-or-create result.
        if (err?.code !== '23505') throw err;
        const winner = await this.convoRepo.findOne({
          where: {
            sellerId,
            customerId,
            commerceProfileId: verifiedProfileId === null ? IsNull() : verifiedProfileId,
          },
          relations: { customer: true, seller: true },
        });
        if (!winner) throw err;
        convo = winner;
      }
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
    context?: ConversationContext | null,
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

    const convo = await this.getOrCreateConversation(sellerId, customer.id, commerceProfileId);

    // Tag the thread with the listing this "Message Seller" tap came from
    // (ProductDetail.js/ClassifiedDetail.js/ServiceDetail.js) — see
    // resolveContext()'s own comment for why this is fetched fresh rather
    // than trusted from the client. Always overwritten to the latest
    // listing messaged about; a resolution failure (deleted/not-owned
    // listing) never blocks opening the conversation itself, only skips
    // the tag.
    const resolved = await this.resolveContext(sellerId, context);
    if (resolved) {
      await this.convoRepo.update(convo.id, {
        linkedContextType: resolved.type as any,
        linkedContextId: resolved.id,
        linkedContextTitle: resolved.title,
        linkedContextImage: resolved.image,
      });
      convo.linkedContextType = resolved.type as any;
      convo.linkedContextId = resolved.id;
      convo.linkedContextTitle = resolved.title;
      convo.linkedContextImage = resolved.image;

      // A real first message, not just a silent tag — reuses the exact
      // product-card rendering SellerInbox.js already has for
      // shareProduct() (MessageType.PRODUCT + productName/Image/Price
      // metadata keys), so classified/service context renders with zero
      // frontend changes to the message bubble itself.
      await this.sendMessageAsBuyer(
        buyer.id,
        convo.id,
        {
          content: `${resolved.type === 'service' ? 'Huduma' : resolved.type === 'classified' ? 'Tangazo' : 'Bidhaa'}: ${resolved.title}${resolved.price ? ` — TZS ${resolved.price.toLocaleString()}` : ''}`,
          type: MessageType.PRODUCT,
          metadata: {
            contextType: resolved.type,
            contextId: resolved.id,
            productName: resolved.title,
            productPrice: resolved.price,
            productImage: resolved.image,
          },
        },
        buyer,
      );
    }

    return convo;
  }

  // ── Get messages in a conversation ───────────────────────────────────────
  // Cursor-paginated on message id (monotonic, no timestamp-collision risk):
  // no `before` = the most recent page (what opening a conversation wants);
  // `before` = the id of the oldest message currently on screen, for
  // "load older" scrolling up. Was a flat `take: 100` with no way to reach
  // anything before it — any conversation past 100 messages had its entire
  // earlier history permanently unreachable through this endpoint.

  private static readonly MESSAGE_PAGE_SIZE = 50;

  private async fetchMessagePage(
    conversationId: number,
    before?: number,
    extraWhere: Record<string, any> = {},
  ): Promise<{ messages: ConversationMessage[]; hasMore: boolean }> {
    const limit = ConversationService.MESSAGE_PAGE_SIZE;
    const rows = await this.msgRepo.find({
      where: before
        ? { conversationId, id: LessThan(before), ...extraWhere }
        : { conversationId, ...extraWhere },
      order: { id: 'DESC' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // oldest-first for display
    return { messages: page, hasMore };
  }

  async getMessages(
    sellerId: number,
    conversationId: number,
    before?: number,
  ) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
      relations: { customer: true, assignedTo: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const { messages, hasMore } = await this.fetchMessagePage(
      conversationId,
      before,
    );

    // Mark as read — only on the initial (most-recent) page; paging further
    // back into history isn't a new "read" action and shouldn't re-fire the
    // notification bridge below on every scroll-up.
    if (!before) {
      await this.convoRepo.update(conversationId, { unreadCount: 0 });
      if (convo.customerId) {
        this.notifService
          .markReadByAction(sellerId, 'SellerInbox', String(convo.customerId))
          .catch(() => {});
      }
    }

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages, hasMore };
  }

  // ── Get messages in a conversation, as the BUYER ──────────────────────────

  async getMessagesAsBuyer(
    userId: number,
    conversationId: number,
    before?: number,
  ) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true, seller: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const { messages, hasMore } = await this.fetchMessagePage(
      conversationId,
      before,
      { isNote: false },
    );

    if (!before) {
      await this.convoRepo.update(conversationId, { buyerUnreadCount: 0 });
      // Bridge to the bell/profile-badge notification count — see
      // InAppNotificationService.markReadByAction's own comment for why.
      this.notifService
        .markReadByAction(userId, 'MessageSeller', String(convo.sellerId))
        .catch(() => {});
    }

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages, hasMore };
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

    // Live push — purely additive, the message is already durably
    // persisted above regardless of whether anyone is connected to receive
    // this. Never awaited/blocking: a socket hiccup must never affect the
    // REST response the caller is waiting on.
    try {
      this.gateway.emitNewMessage({
        conversationId,
        sellerId,
        buyerUserId: convo.customer?.userId ?? null,
        message: msg,
        isNote: !!dto.isNote,
      });
    } catch {
      // Non-critical — the message is already durably persisted above.
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
      type: dto.type || MessageType.TEXT,
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

    try {
      this.gateway.emitNewMessage({
        conversationId,
        sellerId: convo.sellerId,
        buyerUserId: userId,
        message: msg,
        isNote: false,
      });
    } catch {
      // Non-critical — the message is already durably persisted above.
    }

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

  // ── System messages (order/invoice cards) — shared real-time push ─────────
  // Both addOrderMessage and addInvoiceMessage are called from OUTSIDE any
  // request that already has the conversation loaded (order-creation,
  // payment webhooks), so unlike sendMessage/sendMessageAsBuyer they need to
  // fetch sellerId/buyerUserId themselves before they can push live. Kept as
  // one helper so this fetch-and-emit logic isn't duplicated per card type.
  private async emitSystemMessage(
    conversationId: number,
    msg: ConversationMessage,
  ): Promise<void> {
    try {
      const convo = await this.convoRepo.findOne({
        where: { id: conversationId },
        relations: { customer: true },
      });
      if (!convo) return;
      this.gateway.emitNewMessage({
        conversationId,
        sellerId: convo.sellerId,
        buyerUserId: convo.customer?.userId ?? null,
        message: msg,
        isNote: false,
      });
    } catch {
      // Non-critical — the message is already durably persisted above.
    }
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
    const msg = await this.msgRepo.save(
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

    await this.emitSystemMessage(conversationId, msg);
  }

  // ── Invoice created / paid — narrates the rest of the commerce loop
  // (order → invoice → payment) inside the same thread, so "did you pay?"
  // never needs to leave the chat. One method for both states since they
  // share every field except the message text.
  async addInvoiceMessage(
    conversationId: number,
    invoice: { invoiceNumber: string; amount: number; paid: boolean },
  ): Promise<void> {
    const content = invoice.paid
      ? `Malipo yamepokelewa ✅ — Ankara #${invoice.invoiceNumber}`
      : `Ankara mpya #${invoice.invoiceNumber} — TZS ${invoice.amount.toLocaleString()}`;

    const msg = await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: MessageSenderType.SYSTEM,
        type: MessageType.INVOICE,
        content,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoice.amount,
          invoicePaid: invoice.paid,
        },
      }),
    );

    await this.convoRepo.update(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: invoice.paid
        ? `✅ Malipo yamepokelewa — Ankara #${invoice.invoiceNumber}`
        : `🧾 Ankara #${invoice.invoiceNumber}`,
      messageCount: () => '"messageCount" + 1',
    });

    await this.emitSystemMessage(conversationId, msg);
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

  // ── Pin / mute — personal to each side, see the entity's own comment ─────

  async togglePin(sellerId: number, conversationId: number): Promise<{ pinned: boolean }> {
    const convo = await this.convoRepo.findOne({ where: { id: conversationId, sellerId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.sellerPinned = !convo.sellerPinned;
    await this.convoRepo.save(convo);
    return { pinned: convo.sellerPinned };
  }

  async toggleMute(sellerId: number, conversationId: number): Promise<{ muted: boolean }> {
    const convo = await this.convoRepo.findOne({ where: { id: conversationId, sellerId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.sellerMuted = !convo.sellerMuted;
    await this.convoRepo.save(convo);
    return { muted: convo.sellerMuted };
  }

  async togglePinAsBuyer(userId: number, conversationId: number): Promise<{ pinned: boolean }> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    convo.buyerPinned = !convo.buyerPinned;
    await this.convoRepo.save(convo);
    return { pinned: convo.buyerPinned };
  }

  async toggleMuteAsBuyer(userId: number, conversationId: number): Promise<{ muted: boolean }> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    convo.buyerMuted = !convo.buyerMuted;
    await this.convoRepo.save(convo);
    return { muted: convo.buyerMuted };
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
