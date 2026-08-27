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
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { PushService } from './push.service';

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
    private readonly push: PushService,
  ) {}

  // ── Core notify — saves in-app + fires push ───────────────────────────────
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
  async getMyNotifications(userId: number, page = 1, limit = 30) {
    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { items, total, unread: items.filter((n) => !n.isRead).length };
  }

  async markRead(userId: number, notifId: number) {
    await this.repo.update(
      { id: notifId, userId },
      { isRead: true, readAt: new Date() },
    );
  }

  async markAllRead(userId: number) {
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

  async getUnreadCount(userId: number): Promise<number> {
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
    });
  }

  // markAllRead without second arg (controller calls with just userId)
  async markAllReadById(userId: number) {
    await this.repo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
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
