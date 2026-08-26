/**
 * PostEngagement — tracks every commerce action on a feed post OR a raw
 * commerce entity (classified / product / service) that doesn't have a
 * real feed post yet.
 *
 * Exactly one of (postId) or (entityType + entityId) is set per row:
 *  - Real feed post  → postId set, entityType/entityId null
 *  - Virtual post    → postId null, entityType + entityId set
 *
 * Place at: src/feed/entities/post-engagement.entity.ts
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BusinessFeedItem } from '../../business/entities/business-feed-item.entity';

export enum EngagementType {
  SAVE = 'save', // weight 3
  COMMENT = 'comment', // weight 2
  SHARE = 'share', // weight 1
  VIEW = 'view', // weight 0.5
  PURCHASE = 'purchase', // weight 10
  SHIPMENT = 'shipment', // weight 8
}

export const CVS_WEIGHTS: Record<EngagementType, number> = {
  [EngagementType.PURCHASE]: 10,
  [EngagementType.SHIPMENT]: 8,
  [EngagementType.SAVE]: 3,
  [EngagementType.COMMENT]: 2,
  [EngagementType.SHARE]: 1,
  [EngagementType.VIEW]: 0.5,
};

// Prefix used to build virtual post ids on the frontend (cls-12, prd-8, svc-3)
export const ENTITY_PREFIX: Record<string, string> = {
  classified: 'cls',
  product: 'prd',
  service: 'svc',
};

@Entity('post_engagement')
@Index(['postId', 'userId', 'type'], { unique: true })
@Index(['entityType', 'entityId', 'userId', 'type'], { unique: true })
export class PostEngagement {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Real feed post (nullable — only set when engaging a published post) ──
  @ManyToOne(() => BusinessFeedItem, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  post: BusinessFeedItem | null;

  @Column({ type: 'int', nullable: true })
  postId: number | null;

  // ── Virtual entity (classified / product / service) ──────────────────────
  @Column({ type: 'varchar', nullable: true })
  entityType: string | null;

  @Column({ type: 'int', nullable: true })
  entityId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: EngagementType })
  type: EngagementType;

  @CreateDateColumn()
  createdAt: Date;
}
