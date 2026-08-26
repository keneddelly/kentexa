import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityService, RecordActivityInput } from './activity.service';
import {
  ActivityCategory,
  ActivitySeverity,
  ActorType,
} from './entities/activity-event.entity';

@Injectable()
export class ActivityListener {
  private readonly logger = new Logger(ActivityListener.name);

  constructor(private readonly activityService: ActivityService) {}

  @OnEvent('order.placed')
  async onOrderPlaced(payload: {
    orderId: number;
    buyerId: number;
    sellerId?: number | null;
    amount: number;
    productId?: number | null;
  }) {
    await this.safeRecord(() => ({
      eventType: 'order.placed',
      eventCategory: ActivityCategory.COMMERCE,
      actorId: payload.buyerId,
      actorType: ActorType.USER,
      businessId: payload.sellerId ?? null,
      targetType: 'order',
      targetId: payload.orderId,
      relatedUserId: payload.sellerId ?? null,
      source: 'orders',
      metadata: { amount: payload.amount, productId: payload.productId },
    }));
  }

  @OnEvent('order.completed')
  async onOrderCompleted(payload: {
    orderId: number;
    buyerId?: number | null;
    sellerId?: number | null;
    amount: number;
  }) {
    await this.safeRecord(() => ({
      eventType: 'order.completed',
      eventCategory: ActivityCategory.COMMERCE,
      actorId: payload.sellerId ?? null,
      actorType: ActorType.USER,
      businessId: payload.sellerId ?? null,
      targetType: 'order',
      targetId: payload.orderId,
      relatedUserId: payload.buyerId ?? null,
      source: 'orders',
      metadata: { amount: payload.amount },
    }));
  }

  @OnEvent('payment.succeeded')
  async onPaymentSucceeded(payload: {
    paymentId: number;
    orderId?: number | null;
    amount: number;
    provider: string;
  }) {
    await this.safeRecord(() => ({
      eventType: 'payment.succeeded',
      eventCategory: ActivityCategory.PAYMENT,
      actorType: ActorType.SYSTEM,
      targetType: 'payment',
      targetId: payload.paymentId,
      source: 'payments',
      metadata: {
        amount: payload.amount,
        provider: payload.provider,
        orderId: payload.orderId,
      },
    }));
  }

  @OnEvent('payment.failed')
  async onPaymentFailed(payload: {
    paymentId: number;
    orderId?: number | null;
    amount: number;
    provider: string;
    failureReason?: string | null;
  }) {
    await this.safeRecord(() => ({
      eventType: 'payment.failed',
      eventCategory: ActivityCategory.PAYMENT,
      actorType: ActorType.SYSTEM,
      targetType: 'payment',
      targetId: payload.paymentId,
      severity: ActivitySeverity.WARNING,
      source: 'payments',
      metadata: {
        amount: payload.amount,
        provider: payload.provider,
        failureReason: payload.failureReason,
        orderId: payload.orderId,
      },
    }));
  }

  @OnEvent('message.sent')
  async onMessageSent(payload: {
    conversationId: number;
    sellerId: number;
    senderId: number;
    isNote?: boolean;
  }) {
    if (payload?.isNote) return;
    await this.safeRecord(() => ({
      eventType: 'message.sent',
      eventCategory: ActivityCategory.MESSAGING,
      actorId: payload.senderId,
      actorType: ActorType.USER,
      businessId: payload.sellerId,
      targetType: 'conversation',
      targetId: payload.conversationId,
      source: 'business',
      metadata: {},
    }));
  }

  @OnEvent('feed.post_created')
  async onFeedPostCreated(payload: {
    postId: number;
    sellerId: number;
    type: string;
  }) {
    await this.safeRecord(() => ({
      eventType: 'feed.post_created',
      eventCategory: ActivityCategory.CONTENT,
      actorId: payload.sellerId,
      actorType: ActorType.USER,
      businessId: payload.sellerId,
      targetType: 'feed_item',
      targetId: payload.postId,
      source: 'feed',
      metadata: { postType: payload.type },
    }));
  }

  @OnEvent('user.registered')
  async onUserRegistered(payload: { userId: number; role: string }) {
    await this.safeRecord(() => ({
      eventType: 'user.registered',
      eventCategory: ActivityCategory.AUTH,
      actorId: payload.userId,
      actorType: ActorType.USER,
      targetType: 'user',
      targetId: payload.userId,
      source: 'auth',
      metadata: { role: payload.role },
    }));
  }

  @OnEvent('business.verified')
  async onBusinessVerified(payload: {
    businessId: number;
    sellerProfileId: number;
  }) {
    await this.safeRecord(() => ({
      eventType: 'business.verified',
      eventCategory: ActivityCategory.VERIFICATION,
      actorType: ActorType.SYSTEM,
      businessId: payload.businessId,
      targetType: 'seller_profile',
      targetId: payload.sellerProfileId,
      source: 'seller',
      metadata: {},
    }));
  }

  // Every @OnEvent handler routes through here. EventEmitter2.emit() (used by
  // every emit call site, deliberately fire-and-forget) never awaits or
  // catches a listener's returned promise — on Node 15+ an unhandled
  // rejection kills the whole process. Deferring payload access into this
  // try/catch (rather than only wrapping the final DB write) means even a
  // malformed payload can only ever produce a warning log, never a crash of
  // the real request that triggered the event.
  private async safeRecord(build: () => RecordActivityInput) {
    try {
      const input = build();
      await this.activityService.record(input);
    } catch (err) {
      this.logger.warn(`Failed to record activity event: ${err?.message}`);
    }
  }
}
