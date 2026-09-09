/**
 * in-app-notification.service.ts — UPDATED with push triggers
 * Place at: src/notifications/in-app-notification.service.ts
 *
 * Changes from previous version:
 * - PushService injected
 * - Every notify() call also triggers a push notification
 * - Push is fire-and-forget (never blocks the main flow)
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Notification, NotificationAudienceScope, NotificationType } from './entities/notification.entity';
import { PushService } from './push.service';
import { CommunicationFeatureFlagsService } from '../communication/communication-feature-flags.service';
import { RoleContext } from '../role-context/role-context.types';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

export interface NotifyTarget {
  email?: string;
  phone?: string;
  name?: string;
}

@Injectable()
export class InAppNotificationService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    @InjectRepository(AccountRole)
    private accountRoleRepo: Repository<AccountRole>,
    private readonly push: PushService,
    private readonly flags: CommunicationFeatureFlagsService,
  ) {}

  /**
   * Stage 2B item 4: the current permitted audience for a resolved
   * RoleContext. ACCOUNT is always included (never gated by active role);
   * ROLE/TRANSACTION match this exact accountRoleId; WORKSPACE matches this
   * exact workspace (RoleContext.profileType/profileId, same descriptor
   * Stage 1 already resolves for every operational role). Applied as a
   * WHERE clause on the query itself -- never "fetch userId-wide then
   * filter after the fact".
   */
  private applyAudienceScope(qb: ReturnType<Repository<Notification>['createQueryBuilder']>, roleContext: RoleContext): void {
    qb.andWhere(
      new Brackets((sub) => {
        sub.where('n.audienceScope = :accountScope', { accountScope: NotificationAudienceScope.ACCOUNT });
        sub.orWhere(
          '(n.audienceScope IN (:...roleScopes) AND n.recipientAccountRoleId = :accountRoleId)',
          { roleScopes: [NotificationAudienceScope.ROLE, NotificationAudienceScope.TRANSACTION], accountRoleId: roleContext.accountRoleId },
        );
        if (roleContext.profileType !== RoleProfileType.USER) {
          sub.orWhere(
            '(n.audienceScope = :workspaceScope AND n."recipientWorkspaceType" = :wsType AND n."recipientWorkspaceId" = :wsId)',
            { workspaceScope: NotificationAudienceScope.WORKSPACE, wsType: roleContext.profileType, wsId: roleContext.profileId },
          );
        }
      }),
    );
  }

  /** Same audience condition as applyAudienceScope, unaliased for use inside an UPDATE query builder. */
  private applyAudienceScopeUpdate(qb: any, roleContext: RoleContext): void {
    qb.andWhere(
      new Brackets((sub: any) => {
        sub.where('"audienceScope" = :accountScope', { accountScope: NotificationAudienceScope.ACCOUNT });
        sub.orWhere(
          '("audienceScope" IN (:...roleScopes) AND "recipientAccountRoleId" = :accountRoleId)',
          { roleScopes: [NotificationAudienceScope.ROLE, NotificationAudienceScope.TRANSACTION], accountRoleId: roleContext.accountRoleId },
        );
        if (roleContext.profileType !== RoleProfileType.USER) {
          sub.orWhere(
            '("audienceScope" = :workspaceScope AND "recipientWorkspaceType" = :wsType AND "recipientWorkspaceId" = :wsId)',
            { workspaceScope: NotificationAudienceScope.WORKSPACE, wsType: roleContext.profileType, wsId: roleContext.profileId },
          );
        }
      }),
    );
  }

  /**
   * Stage 2B item 6: resolves ROLE-scoped audience params for the event
   * helper methods below (orderPlaced, orderPaid, payoutReleased, etc.) --
   * their callers (orders.service.ts, warranty.service.ts, super-agents.
   * service.ts, ...) are NOT touched; the audience is resolved HERE,
   * inside the notification layer itself, which already has everything it
   * needs (the recipient's userId and which side of the transaction they
   * are). Returns {} (falls back to ACCOUNT/legacy_unscoped, exactly Stage
   * 2A's original behavior) if the recipient has no active AccountRole of
   * that type yet -- never guesses, never blocks the notification.
   */
  // Multi-Business Authority Stage 1: this was an unordered .findOne() on
  // bare (userId, roleType) -- safe only while at most one AccountRole row
  // of that type could exist per user. Now that seller/super_agent/
  // transport_provider/service_provider roles may repeat (one per
  // Business), an unordered pick risks stamping a notification with the
  // WRONG business's AccountRole/workspace -- e.g. an order-paid
  // notification for Business B getting attributed to Business A's Seller
  // AccountRole, making it invisible under Business B's own (correctly
  // workspace-scoped, see applyAudienceScope above) notification read.
  //
  // Ordering by id ASC makes the pick deterministic (removes the Postgres
  // arbitrary-row risk), but does NOT make it business-CORRECT: none of
  // this method's callers (orders/warranty/super-agents event helpers)
  // currently have a workspace-specific disambiguator to pass in, because
  // the underlying transactions (Order, Invoice, Payment) don't carry a
  // workspaceId of their own yet (confirmed NOT READY in the Business-First
  // data-ownership audit) -- genuine per-Business correctness for these
  // notifications requires that upstream work first, which is out of this
  // stage's scope (see report). `preferredWorkspaceId`/`preferredWorkspaceType`
  // let a future caller that DOES have a resolved disambiguator supply one;
  // no current caller does.
  private async resolveRoleAudience(
    userId: number | undefined | null,
    roleType: AccountRoleType,
    preferredWorkspaceType?: string | null,
    preferredWorkspaceId?: number | null,
  ): Promise<{
    audienceScope?: NotificationAudienceScope;
    recipientAccountRoleId?: number;
    recipientWorkspaceType?: string;
    recipientWorkspaceId?: number;
  }> {
    if (!userId) return {};
    let role: AccountRole | null = null;
    if (preferredWorkspaceType && preferredWorkspaceId != null) {
      role = await this.accountRoleRepo.findOne({
        where: {
          userId,
          roleType,
          status: AccountRoleStatus.ACTIVE,
          profileType: preferredWorkspaceType as RoleProfileType,
          profileId: preferredWorkspaceId,
        },
      });
    }
    if (!role) {
      role = await this.accountRoleRepo.findOne({
        where: { userId, roleType, status: AccountRoleStatus.ACTIVE },
        order: { id: 'ASC' },
      });
    }
    if (!role) return {};
    const workspace =
      role.profileType && role.profileType !== RoleProfileType.USER && role.profileId != null
        ? { recipientWorkspaceType: role.profileType as string, recipientWorkspaceId: role.profileId }
        : {};
    return { audienceScope: NotificationAudienceScope.ROLE, recipientAccountRoleId: role.id, ...workspace };
  }

  // ── Core notify — saves in-app + fires push ───────────────────────────────
  // Stage 2: audience params are all optional and additive. A call site
  // that doesn't pass them gets audienceScope: ACCOUNT (the entity's own
  // default) -- i.e. every existing caller keeps behaving exactly as
  // before, visible account-wide regardless of active role. Only call
  // sites updated to resolve a real operational recipient (server-side,
  // never a client-supplied id) pass ROLE/WORKSPACE/TRANSACTION explicitly.
  async notify(params: {
    userId: number;
    type: NotificationType | string;
    title: string;
    body: string;
    icon?: string;
    actionPage?: string;
    actionParam?: string;
    actionCommerceProfileId?: number;
    orderId?: number;
    trackingNumber?: string;
    audienceScope?: NotificationAudienceScope | string;
    recipientAccountRoleId?: number;
    recipientWorkspaceType?: string;
    recipientWorkspaceId?: number;
    sourceType?: string;
    sourceId?: number;
    actionRouteKey?: string;
    actionParams?: Record<string, any>;
    classificationStatus?: string;
  }): Promise<Notification> {
    const notif = await this.repo.save(
      this.repo.create({
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        icon: params.icon || '🔔',
        actionPage: params.actionPage || null,
        actionParam: params.actionParam || null,
        actionCommerceProfileId: params.actionCommerceProfileId || null,
        orderId: params.orderId || null,
        trackingNumber: params.trackingNumber || null,
        isRead: false,
        audienceScope: params.audienceScope || NotificationAudienceScope.ACCOUNT,
        recipientAccountRoleId: params.recipientAccountRoleId ?? null,
        recipientWorkspaceType: params.recipientWorkspaceType ?? null,
        recipientWorkspaceId: params.recipientWorkspaceId ?? null,
        sourceType: params.sourceType ?? null,
        sourceId: params.sourceId ?? null,
        actionRouteKey: params.actionRouteKey ?? null,
        actionParams: params.actionParams ?? null,
        classificationStatus: params.classificationStatus || (params.recipientAccountRoleId ? 'resolved' : 'legacy_unscoped'),
      }),
    );

    // Fire push — non-blocking, never throws
    this.push
      .sendToUser(params.userId, {
        title: params.title,
        body: params.body,
        icon: '/icons/icon-192x192.png',
        url: params.actionPage
          ? `/?page=${params.actionPage}${params.actionParam ? `&param=${params.actionParam}` : ''}`
          : '/',
        tag: params.type,
      })
      .catch(() => {});

    return notif;
  }

  // ── Event helpers ─────────────────────────────────────────────────────────

  async orderPlaced(
    buyer: NotifyTarget,
    seller: NotifyTarget,
    orderId: number,
    productName: string,
    sellerCommerceProfileId?: number | null,
  ) {
    const buyerUser = await this.getUserByPhone(buyer.phone);
    const sellerUser = await this.getUserByPhone(seller.phone);

    if (buyerUser) {
      await this.notify({
        userId: buyerUser.id,
        type: NotificationType.ORDER_PLACED,
        title: '✅ Agizo Limepokelewa',
        body: `Agizo lako la "${productName}" limepokelewa. Subiri uthibitisho wa muuzaji.`,
        actionPage: 'MyOrders',
        actionParam: String(orderId),
        orderId,
        icon: '📦',
        sourceType: 'order',
        sourceId: orderId,
        ...(await this.resolveRoleAudience(buyerUser.id, AccountRoleType.BUYER)),
      });
    }
    if (sellerUser) {
      await this.notify({
        userId: sellerUser.id,
        type: NotificationType.ORDER_PLACED,
        title: '🛒 Agizo Jipya!',
        body: `${buyer.name || 'Mnunuzi'} amenunua "${productName}". Tuma haraka!`,
        actionPage: 'SellerOrders',
        actionParam: String(orderId),
        actionCommerceProfileId: sellerCommerceProfileId || undefined,
        orderId,
        icon: '🛒',
        sourceType: 'order',
        sourceId: orderId,
        ...(await this.resolveRoleAudience(sellerUser.id, AccountRoleType.SELLER)),
      });
    }
  }

  async orderPaid(
    buyer: NotifyTarget,
    seller: NotifyTarget,
    orderId: number,
    amount: number,
    sellerCommerceProfileId?: number | null,
  ) {
    const sellerUser = await this.getUserByPhone(seller.phone);
    if (sellerUser) {
      await this.notify({
        userId: sellerUser.id,
        type: NotificationType.ORDER_PAID,
        title: '💰 Malipo Yamepokelewa!',
        body: `TZS ${Number(amount).toLocaleString()} imewekwa kwenye escrow. Tuma bidhaa.`,
        actionPage: 'SellerOrders',
        actionParam: String(orderId),
        actionCommerceProfileId: sellerCommerceProfileId || undefined,
        orderId,
        icon: '💰',
        sourceType: 'order',
        sourceId: orderId,
        ...(await this.resolveRoleAudience(sellerUser.id, AccountRoleType.SELLER)),
      });
    }
  }

  async orderCompleted(
    seller: NotifyTarget,
    buyer: NotifyTarget,
    orderId: number,
    sellerAmount: number,
    sellerCommerceProfileId?: number | null,
  ) {
    const sellerUser = await this.getUserByPhone(seller.phone);
    const buyerUser = await this.getUserByPhone(buyer.phone);

    if (sellerUser) {
      await this.notify({
        userId: sellerUser.id,
        type: NotificationType.ORDER_CONFIRMED,
        title: '🎉 Bidhaa Imetolewa — Pata Malipo!',
        body: `Mnunuzi amethibitisha utoaji. TZS ${Number(sellerAmount).toLocaleString()} itatolewa hivi karibuni.`,
        actionPage: 'SellerPayouts',
        actionParam: String(orderId),
        actionCommerceProfileId: sellerCommerceProfileId || undefined,
        orderId,
        icon: '🎉',
        sourceType: 'order',
        sourceId: orderId,
        ...(await this.resolveRoleAudience(sellerUser.id, AccountRoleType.SELLER)),
      });
    }
    if (buyerUser) {
      await this.notify({
        userId: buyerUser.id,
        type: NotificationType.ORDER_CONFIRMED,
        title: '📦 Asante kwa Ununuzi!',
        body: 'Bidhaa imekufikia. Karibuni tena KenteXa!',
        actionPage: 'MyOrders', // was 'Orders' — that's the ADMIN dashboard, not a buyer-reachable page
        actionParam: String(orderId),
        orderId,
        icon: '⭐',
        sourceType: 'order',
        sourceId: orderId,
        ...(await this.resolveRoleAudience(buyerUser.id, AccountRoleType.BUYER)),
      });
    }
  }

  async shipmentCreated(
    superAgent: NotifyTarget,
    sender: NotifyTarget,
    trackingNumber: string,
    destination: string,
  ) {
    const senderUser = await this.getUserByPhone(sender.phone);
    if (senderUser) {
      await this.notify({
        userId: senderUser.id,
        type: NotificationType.SHIPMENT_CREATED,
        title: '📦 Kifurushi Kimesajiliwa',
        body: `Kifurushi chako ${trackingNumber} kuelekea ${destination} kimesajiliwa.`,
        actionPage: 'TrackParcel',
        actionParam: trackingNumber,
        trackingNumber,
        icon: '📦',
      });
    }
  }

  async payoutReleased(
    seller: NotifyTarget,
    orderId: number,
    amount: number,
    sellerCommerceProfileId?: number | null,
  ) {
    const sellerUser = await this.getUserByPhone(seller.phone);
    if (sellerUser) {
      await this.notify({
        userId: sellerUser.id,
        type: NotificationType.ORDER_CONFIRMED,
        title: '💸 Malipo Yatumwa!',
        body: `TZS ${Number(amount).toLocaleString()} inatumwa kwenye akaunti yako.`,
        actionPage: 'SellerPayouts',
        actionParam: String(orderId),
        actionCommerceProfileId: sellerCommerceProfileId || undefined,
        orderId,
        icon: '💸',
      });
    }
  }

  async reviewReceived(
    sellerId: number,
    rating: number,
    productName: string,
    productId?: number,
    commerceProfileId?: number | null,
  ) {
    const stars = '⭐'.repeat(rating);
    await this.notify({
      userId: sellerId,
      type: NotificationType.ORDER_CONFIRMED,
      title: `${stars} Tathmini Mpya`,
      body: `"${productName}" imepata tathmini ya nyota ${rating}.`,
      actionPage: productId ? 'ProductDetail' : 'SellerDashboard',
      actionParam: productId ? String(productId) : undefined,
      actionCommerceProfileId: commerceProfileId || undefined,
      icon: '⭐',
      ...(await this.resolveRoleAudience(sellerId, AccountRoleType.SELLER)),
    });
  }

  async disputeRaised(
    seller: NotifyTarget,
    buyer: NotifyTarget,
    orderId: number,
    sellerCommerceProfileId?: number | null,
  ) {
    const sellerUser = await this.getUserByPhone(seller.phone);
    if (sellerUser) {
      await this.notify({
        userId: sellerUser.id,
        type: NotificationType.ORDER_PLACED,
        title: '⚠️ Malalamiko Yamewasilishwa',
        body: 'Mnunuzi amefungua shauri. Toa maelezo yako haraka.',
        actionPage: 'SellerOrders',
        actionParam: String(orderId),
        actionCommerceProfileId: sellerCommerceProfileId || undefined,
        orderId,
        icon: '⚠️',
      });
    }
  }

  async newFollower(
    businessUserId: number,
    followerName: string,
    followerId?: number,
  ) {
    // actionCommerceProfileId must identify the FOLLOWER's own profile, not
    // the profile that was just followed (the recipient's own) — passing
    // the latter here used to make tapping "new follower" land the
    // recipient on their OWN profile instead of the follower's, since
    // CommerceProfile.js's resolver treats a present commerceProfileId as
    // absolute and ignores the target user id entirely. Leaving it unset
    // lets that resolver fall back to /profiles/for-user/{followerId},
    // which correctly picks the follower's personal profile.
    await this.notify({
      userId: businessUserId,
      type: NotificationType.FOLLOW,
      title: '👤 Mfuataji Mpya!',
      body: `${followerName} ameanza kufuata biashara yako.`,
      actionPage: 'CommerceProfile',
      actionParam: followerId ? String(followerId) : undefined,
      icon: '👤',
    });
  }

  // Fired instead of newFollower() when the recipient already followed the
  // new follower first — i.e. this is a reciprocal follow-back, not a cold
  // new follow. Same destination-resolution note as newFollower() above.
  async followedBack(businessUserId: number, followerName: string, followerId?: number) {
    await this.notify({
      userId: businessUserId,
      type: NotificationType.FOLLOW_BACK,
      title: '🤝 Amekufuata Tena!',
      body: `${followerName} amekufuata pia sasa.`,
      actionPage: 'CommerceProfile',
      actionParam: followerId ? String(followerId) : undefined,
      icon: '🤝',
    });
  }

  async businessFeedPost(
    followerUserId: number,
    businessName: string,
    postTitle: string,
    sellerId: number,
    commerceProfileId?: number | null,
  ) {
    await this.notify({
      userId: followerUserId,
      type: NotificationType.ORDER_PLACED,
      title: `📢 ${businessName}`,
      body: postTitle,
      actionPage: 'CommerceProfile',
      actionParam: String(sellerId),
      actionCommerceProfileId: commerceProfileId || undefined,
      icon: '📢',
    });
  }

  // ── Read management ───────────────────────────────────────────────────────
  // Stage 2B: roleContext is optional on every method below. Omitted (every
  // pre-Stage-2B caller), behavior is byte-for-byte unchanged -- the
  // account-wide userId query. Passed AND SCOPED_NOTIFICATION_READ is on,
  // the query itself (not a post-fetch filter) is additionally constrained
  // to ACCOUNT-scope rows plus ROLE/WORKSPACE/TRANSACTION rows matching the
  // resolved context -- never `notification.userId = currentUser` alone for
  // an operational (non-ACCOUNT) row.
  async getMyNotifications(userId: number, page = 1, limit = 30, roleContext?: RoleContext) {
    const qb = this.repo.createQueryBuilder('n').where('n.userId = :userId', { userId });
    if (roleContext && this.flags.isEnabled('SCOPED_NOTIFICATION_READ')) {
      this.applyAudienceScope(qb, roleContext);
    }
    const [items, total] = await qb
      .orderBy('n.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();
    return { items, total, unread: items.filter((n) => !n.isRead).length };
  }

  async markRead(userId: number, notifId: number, roleContext?: RoleContext) {
    if (roleContext && this.flags.isEnabled('SCOPED_NOTIFICATION_READ')) {
      const qb = this.repo
        .createQueryBuilder()
        .update(Notification)
        .set({ isRead: true, readAt: new Date() })
        .where('id = :notifId AND "user_id" = :userId', { notifId, userId });
      this.applyAudienceScopeUpdate(qb, roleContext);
      await qb.execute();
      return;
    }
    await this.repo.update(
      { id: notifId, userId },
      { isRead: true, readAt: new Date() },
    );
  }

  async markAllRead(userId: number, roleContext?: RoleContext) {
    if (roleContext && this.flags.isEnabled('SCOPED_NOTIFICATION_READ')) {
      const qb = this.repo
        .createQueryBuilder()
        .update(Notification)
        .set({ isRead: true, readAt: new Date() })
        .where('"user_id" = :userId AND "isRead" = false', { userId });
      this.applyAudienceScopeUpdate(qb, roleContext);
      await qb.execute();
      return;
    }
    await this.repo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  // Bridges the two "unread" systems that otherwise never talk to each
  // other: opening a conversation zeroes Conversation.unreadCount/
  // buyerUnreadCount (ConversationService), but that never touched this
  // Notification table, so the bell/profile badge (fed by getUnreadCount
  // below) kept showing stale message-notification counts after a user had
  // already read everything in the Inbox. There's no conversationId FK on
  // Notification, so this correlates on the same (actionPage, actionParam)
  // deep-link pair conversation.service.ts already sets when it creates a
  // message notification — precise because that pair is how the frontend
  // itself finds its way back to one specific conversation.
  async markReadByAction(
    userId: number,
    actionPage: string,
    actionParam: string,
  ): Promise<void> {
    await this.repo.update(
      { userId, actionPage, actionParam, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  async getUnreadCount(userId: number, roleContext?: RoleContext): Promise<number> {
    if (roleContext && this.flags.isEnabled('SCOPED_NOTIFICATION_READ')) {
      const qb = this.repo
        .createQueryBuilder('n')
        .where('n.userId = :userId AND n.isRead = false', { userId });
      this.applyAudienceScope(qb, roleContext);
      return qb.getCount();
    }
    return this.repo.count({ where: { userId, isRead: false } });
  }

  // ── Backward-compatible aliases (old signature → new) ────────────────────

  // Old: orderConfirmed(sellerId, orderId, productName, rating?, review?)
  async orderConfirmed(
    sellerId: number,
    orderId: number,
    productName: string,
    rating?: number,
    review?: string,
    sellerCommerceProfileId?: number | null,
  ) {
    await this.notify({
      userId: sellerId,
      type: NotificationType.ORDER_CONFIRMED,
      title: rating
        ? `${'⭐'.repeat(rating)} Tathmini Mpya`
        : '🎉 Bidhaa Imetolewa!',
      body: rating
        ? `"${productName}" imepata tathmini ya nyota ${rating}.${review ? ' "' + review + '"' : ''}`
        : `Mnunuzi amethibitisha utoaji wa "${productName}". Pata malipo yako!`,
      actionPage: 'SellerOrders',
      actionParam: String(orderId),
      actionCommerceProfileId: sellerCommerceProfileId || undefined,
      orderId,
      icon: rating ? '⭐' : '🎉',
      sourceType: 'order',
      sourceId: orderId,
      ...(await this.resolveRoleAudience(sellerId, AccountRoleType.SELLER)),
    });
  }

  // Old: orderPlaced(sellerId, orderId, trackingNumber, productName)
  // overloaded — the new signature uses NotifyTarget objects
  // Keep both working by detecting if first arg is a number or object
  async orderPlacedById(
    sellerId: number,
    orderId: number,
    trackingNumber: string,
    productName: string,
    sellerCommerceProfileId?: number | null,
  ) {
    await this.notify({
      userId: sellerId,
      type: NotificationType.ORDER_PLACED,
      title: '🛒 Agizo Jipya!',
      body: `Agizo jipya la "${productName}" limepokelewa. Nambari: ${trackingNumber}`,
      actionPage: 'SellerOrders',
      actionParam: String(orderId),
      actionCommerceProfileId: sellerCommerceProfileId || undefined,
      orderId,
      icon: '🛒',
      sourceType: 'order',
      sourceId: orderId,
      ...(await this.resolveRoleAudience(sellerId, AccountRoleType.SELLER)),
    });
  }

  // Old: disputeRaised(sellerId, orderId, trackingNumber)
  async disputeRaisedById(
    sellerId: number,
    orderId: number,
    trackingNumber: string,
    sellerCommerceProfileId?: number | null,
  ) {
    await this.notify({
      userId: sellerId,
      type: NotificationType.ORDER_PLACED,
      title: '⚠️ Malalamiko Yamewasilishwa',
      body: `Mnunuzi amefungua shauri kwa agizo ${trackingNumber}. Toa maelezo yako haraka.`,
      actionPage: 'SellerOrders',
      actionParam: String(orderId),
      actionCommerceProfileId: sellerCommerceProfileId || undefined,
      orderId,
      icon: '⚠️',
      sourceType: 'order',
      sourceId: orderId,
      ...(await this.resolveRoleAudience(sellerId, AccountRoleType.SELLER)),
    });
  }

  // Old: payoutReleased(sellerId, amount, orderId)
  async payoutReleasedById(
    sellerId: number,
    amount: number,
    orderId: number,
    sellerCommerceProfileId?: number | null,
  ) {
    await this.notify({
      userId: sellerId,
      type: NotificationType.ORDER_CONFIRMED,
      title: '💸 Malipo Yatumwa!',
      body: `TZS ${Number(amount).toLocaleString()} inatumwa kwenye akaunti yako.`,
      actionPage: 'SellerPayouts',
      actionParam: String(orderId),
      actionCommerceProfileId: sellerCommerceProfileId || undefined,
      orderId,
      icon: '💸',
      sourceType: 'order',
      sourceId: orderId,
      ...(await this.resolveRoleAudience(sellerId, AccountRoleType.SELLER)),
    });
  }

  // Old: shipmentCreated(buyerId|null, trackingNumber, description, ...)
  async shipmentCreatedById(
    buyerId: number | null,
    trackingNumber: string,
    description?: string,
    destination?: string,
  ) {
    if (!buyerId) return;
    await this.notify({
      userId: buyerId,
      type: NotificationType.SHIPMENT_CREATED,
      title: '📦 Kifurushi Kimesajiliwa',
      body: `Kifurushi chako ${trackingNumber}${destination ? ' kuelekea ' + destination : ''} kimesajiliwa.`,
      actionPage: 'TrackParcel',
      actionParam: trackingNumber,
      trackingNumber,
      icon: '📦',
      ...(await this.resolveRoleAudience(buyerId, AccountRoleType.BUYER)),
    });
  }

  // markAllRead without second arg (controller calls with just userId) --
  // delegates straight to the scoped-capable markAllRead above.
  async markAllReadById(userId: number, roleContext?: RoleContext) {
    return this.markAllRead(userId, roleContext);
  }

  // ── Helper ────────────────────────────────────────────────────────────────
  private async getUserByPhone(phone?: string): Promise<{ id: number } | null> {
    if (!phone) return null;
    try {
      const result = await this.repo.query(
        'SELECT id FROM "user" WHERE phone = $1 LIMIT 1',
        [phone],
      );
      return result?.[0] || null;
    } catch {
      return null;
    }
  }
}
