/**
 * BusinessFeedItem — content published by businesses for followers
 * Place at: src/business/entities/business-feed-item.entity.ts
 */
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum FeedItemType {
  NEW_PRODUCT    = 'new_product',
  DISCOUNT       = 'discount',
  ANNOUNCEMENT   = 'announcement',
  RESTOCK        = 'restock',
  NEW_SERVICE    = 'new_service',
  DELIVERY_INFO  = 'delivery_info',
  MOMENT         = 'moment',       // "I'm Selling" — photo tagged to a listing
  LOOKING_FOR    = 'looking_for',  // "I'm Looking For" — any user asking for a product/service
}

@Entity('business_feed_item')
export class BusinessFeedItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  business: User;

  @Column({ type: 'int' })
  businessId: number;

  @Column({ type: 'enum', enum: FeedItemType })
  type: FeedItemType;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  linkedEntityType: string | null;

  @Column({ type: 'int', nullable: true })
  linkedEntityId: number | null;

  @Column({ type: 'varchar', nullable: true })
  ctaLabel: string | null;

  // Only used by LOOKING_FOR posts — same category list as Search/Discover,
  // lets sellers eventually filter buyer requests by their own category.
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  // ── Commerce Value Score ──────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cvsScore: number;

  @Column({ type: 'int', default: 0 })
  saveCount: number;

  @Column({ type: 'int', default: 0 })
  commentCount: number;

  @Column({ type: 'int', default: 0 })
  shareCount: number;

  @Column({ type: 'int', default: 0 })
  purchaseCount: number;

  @Column({ type: 'int', default: 0 })
  shipmentCount: number;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;
}