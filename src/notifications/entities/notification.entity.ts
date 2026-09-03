/**
 * notification.entity.ts — In-app notification storage
 * Place at: src/notifications/entities/notification.entity.ts
 *
 * Every important event creates a notification record.
 * Frontend polls /notifications/my (or uses SSE in future).
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Stage 2 communication isolation. ACCOUNT = account-wide (security/policy/
// auth notices, follows, generic system messages) -- always visible
// regardless of active role, never gated. ROLE/WORKSPACE/TRANSACTION are
// operational and must only surface while the resolved recipient
// AccountRole/workspace/transaction is the caller's CURRENT active context.
export enum NotificationAudienceScope {
  ACCOUNT = 'ACCOUNT',
  ROLE = 'ROLE',
  WORKSPACE = 'WORKSPACE',
  TRANSACTION = 'TRANSACTION',
}

export enum NotificationType {
  ORDER_PLACED = 'order_placed',
  ORDER_PAID = 'order_paid',
  ORDER_DELIVERED = 'order_delivered',
  ORDER_CONFIRMED = 'order_confirmed', // buyer confirmed receipt
  ORDER_DISPUTED = 'order_disputed',
  PAYOUT_RELEASED = 'payout_released',
  REVIEW_RECEIVED = 'review_received',
  PARCEL_ARRIVED = 'parcel_arrived',
  AGENT_CLAIMED = 'agent_claimed',
  SHIPMENT_CREATED = 'shipment_created',
  PAYMENT_RECEIVED = 'payment_received',
  FOLLOW = 'follow',
  FOLLOW_BACK = 'follow_back',
  COMMENT = 'comment',
  COMMENT_REPLY = 'comment_reply',
  SAVE = 'save',
  SYSTEM = 'system',
}

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  // Who receives this notification
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar' })
  type: string; // NotificationType

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  // Optional deep-link: 'SellerOrders', 'TrackParcel-KTX-SHP-72'
  @Column({ type: 'varchar', nullable: true })
  actionPage: string | null;

  @Column({ type: 'varchar', nullable: true })
  actionParam: string | null;

  // When actionPage targets a specific CommerceProfile (e.g. 'CommerceProfile'
  // for a business's own post), this is REQUIRED for the frontend to land on
  // that exact profile — without it, CommerceProfile.js's resolver falls back
  // to the owner's personal profile, since a bare user id is ambiguous
  // between their personal identity and any business/agent/hub they run.
  @Column({ type: 'int', nullable: true })
  actionCommerceProfileId: number | null;

  // Icon/emoji for the notification
  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  // Link to related entity
  @Column({ type: 'int', nullable: true })
  orderId: number | null;

  @Column({ type: 'varchar', nullable: true })
  trackingNumber: string | null;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  // ── Stage 2: audience (additive, dual-write) ─────────────────────────────
  // Defaults to ACCOUNT so every pre-Stage-2 row (and any call site not yet
  // updated to pass audience info) stays visible account-wide -- the safe
  // default, since ACCOUNT is the ONE scope that's never gated by active
  // role. Only new call sites that resolve a real operational recipient
  // (e.g. ConversationService's message notifications) set ROLE/WORKSPACE/
  // TRANSACTION explicitly.
  @Column({ type: 'varchar', default: NotificationAudienceScope.ACCOUNT })
  audienceScope: string;

  @Column({ type: 'int', nullable: true })
  recipientAccountRoleId: number | null;

  @Column({ type: 'varchar', nullable: true })
  recipientWorkspaceType: string | null;

  @Column({ type: 'int', nullable: true })
  recipientWorkspaceId: number | null;

  @Column({ type: 'varchar', nullable: true })
  sourceType: string | null;

  @Column({ type: 'int', nullable: true })
  sourceId: number | null;

  // Typed replacement for actionPage/actionParam -- a server-issued key the
  // frontend maps to a route, plus structured params, rather than a raw
  // page name the frontend already treats as authoritative. actionPage/
  // actionParam are kept unchanged during the transition.
  @Column({ type: 'varchar', nullable: true })
  actionRouteKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  actionParams: Record<string, any> | null;

  @Column({ type: 'varchar', default: 'legacy_unscoped' })
  classificationStatus: string;

  @CreateDateColumn()
  createdAt: Date;
}
