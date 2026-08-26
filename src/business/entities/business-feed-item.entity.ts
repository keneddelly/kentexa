/**
 * BusinessFeedItem — content published by businesses for followers
 * Place at: src/business/entities/business-feed-item.entity.ts
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum FeedItemType {
  NEW_PRODUCT = 'new_product',
  DISCOUNT = 'discount',
  ANNOUNCEMENT = 'announcement',
  RESTOCK = 'restock',
  NEW_SERVICE = 'new_service',
  DELIVERY_INFO = 'delivery_info',
  MOMENT = 'moment', // "I'm Selling" — photo tagged to a listing
  LOOKING_FOR = 'looking_for', // "I'm Looking For" — any user asking for a product/service
}

// Moment spec (2026-08) — a broader, deliberate taxonomy alongside the
// existing FeedItemType, not a replacement for it. `type` keeps driving
// today's UI/ranking unchanged; `intent` is derived from `type` at read
// time for old rows (see feed.service.ts's deriveIntent()) and set
// directly by new create() calls going forward. Two fields exist side by
// side because collapsing them would mean either breaking every existing
// query that filters on `type`, or guessing a lossy mapping backwards —
// neither is worth it for a purely additive upgrade.
export enum MomentIntent {
  UPDATE = 'update',
  OFFER = 'offer',
  SELL_AVAILABLE = 'sell_available',
  NEED = 'need',
  REQUEST = 'request',
  ANNOUNCEMENT = 'announcement',
  ACHIEVEMENT = 'achievement',
}

// What the frontend actually branches on for the Moment's action button —
// ctaLabel stays as the human-readable override text (or the default
// label for whichever actionType is set), this is what decides behavior.
export enum MomentActionType {
  CONTACT = 'contact',
  BUY_NOW = 'buy_now',
  ORDER_NOW = 'order_now',
  VIEW_PRODUCT = 'view_product',
  REQUEST_SERVICE = 'request_service',
  SEND_OFFER = 'send_offer',
  SCHEDULE = 'schedule',
  FOLLOW = 'follow',
}

// Richer than the existing isActive boolean, which stays and becomes
// derivable from this (false whenever status isn't PUBLISHED/DRAFT) so
// every existing query filtering on isActive keeps working unchanged.
export enum MomentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  PAUSED = 'paused',
  FULFILLED = 'fulfilled',
  SOLD_OUT = 'sold_out',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

export enum MomentUrgencyLevel {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export enum MomentVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  LIMITED = 'limited',
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

  // Which specific CommerceProfile this post was published AS — plain
  // nullable id (not a relation, matching CommerceProfile's own pattern
  // of avoiding import-time coupling between modules). Null on every post
  // that predates profile-switching; old posts are never retagged, they
  // just don't have a specific profile to diverge into. Going forward,
  // every new post attributes to whichever profile was active when it
  // was published — Kened's personal posts and Bishoo Intelligence
  // Systems' posts stop being the same feed the moment this is set.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

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

  // ── Moment spec (2026-08) additions — all additive/nullable, see the
  // enum comments above for why each exists alongside older fields. ──────
  @Column({ type: 'enum', enum: MomentIntent, nullable: true })
  intent: MomentIntent | null;

  @Column({ type: 'enum', enum: MomentActionType, nullable: true })
  actionType: MomentActionType | null;

  @Column({ type: 'enum', enum: MomentStatus, default: MomentStatus.PUBLISHED })
  status: MomentStatus;

  @Column({ type: 'enum', enum: MomentUrgencyLevel, nullable: true })
  urgencyLevel: MomentUrgencyLevel | null;

  // Free text initially ("Available Now", "Ends Tonight") — formalize into
  // an enum once real usage data shows the actual set of phrases worth
  // constraining; guessing the taxonomy up front risks locking in the
  // wrong one.
  @Column({ type: 'varchar', nullable: true })
  availabilityStatus: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startsAt: Date | null;

  // Structured location, same convention as LocationPicker/TransportRoute
  // elsewhere — optional and privacy-aware (a Moment doesn't inherit the
  // creator's precise address just because one exists on their profile).
  @Column({ type: 'varchar', nullable: true })
  locationRegion: string | null;

  @Column({ type: 'varchar', nullable: true })
  locationDistrict: string | null;

  @Column({ type: 'varchar', nullable: true })
  locationWard: string | null;

  @Column({ type: 'varchar', nullable: true })
  locationLabel: string | null;

  @Column({ type: 'enum', enum: MomentVisibility, default: MomentVisibility.PUBLIC })
  visibility: MomentVisibility;

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
