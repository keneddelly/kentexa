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

  @CreateDateColumn()
  createdAt: Date;
}
