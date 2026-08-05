/**
 * PostComment — public comments on feed posts OR raw commerce entities
 * (classified / product / service / business) that don't have a real feed
 * post yet.
 *
 * Exactly one of (postId) or (entityType + entityId) is set per row.
 *
 * EXTENDED for the unified Commerce Comment System: every comment now has a
 * `type` (comment / question / review / seller_reply / ai_summary). This
 * replaces the standalone CommerceComment entity from the earlier draft —
 * that was a mistake, a second table would have split comment counts and
 * broken the "one unified thread" goal. Everything below the "NEW" marker
 * is additive; nothing existing was removed or renamed, so this is a
 * backward-compatible ALTER, not a breaking change.
 *
 * Place at: src/feed/entities/post-comment.entity.ts
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BusinessFeedItem } from '../../business/entities/business-feed-item.entity';

// ── NEW: Commerce Comment System additions ─────────────────────────────────
export enum PostCommentType {
  COMMENT = 'comment', // plain comment — existing default behavior
  QUESTION = 'question', // "Ask" — can receive a seller_reply
  REVIEW = 'review', // star rating + optional text/media
  SELLER_REPLY = 'seller_reply', // nested reply from the entity's owner
  AI_SUMMARY = 'ai_summary', // pinned, system-generated, authorId null
}

export enum PurchaseVerification {
  KENTEXA_PURCHASE = 'kentexa_purchase', // matched to a completed Kentexa order
  OFFLINE_PURCHASE = 'offline_purchase', // self-declared "bought it elsewhere"
  COMMUNITY = 'community', // no purchase claim
  NONE = 'none', // not a review
}

export interface CommentMediaItem {
  url: string;
  type: 'image' | 'video';
}
// ── end NEW ─────────────────────────────────────────────────────────────────

@Entity('post_comment')
@Index(['postId'])
@Index(['entityType', 'entityId'])
@Index(['entityType', 'entityId', 'type', 'isDeleted']) // NEW — filter tabs (All/Reviews/Questions/Media)
@Index(['entityType', 'entityId', 'isPinned']) // NEW — pinned AI summary lookup
export class PostComment {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Real feed post (nullable) ─────────────────────────────────────────────
  @ManyToOne(() => BusinessFeedItem, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  post: BusinessFeedItem | null;

  @Column({ type: 'int', nullable: true })
  postId: number | null;

  // ── Virtual entity (classified / product / service / business) ───────────
  @Column({ type: 'varchar', nullable: true })
  entityType: string | null;

  @Column({ type: 'int', nullable: true })
  entityId: number | null;

  // Nullable — NEW: AI_SUMMARY rows have no human author
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  author: User | null;

  @Column({ type: 'int', nullable: true })
  authorId: number | null;

  @Column({ type: 'text', nullable: true }) // nullable relaxed for AI_SUMMARY-with-media-only edge case; still required by service validation for comment/question/review
  body: string | null;

  // ── "I Have This" reply — optional, only set when a seller replies to a
  // Looking For post by tagging one of their own listings ────────────────────
  @Column({ type: 'varchar', nullable: true })
  offerEntityType: string | null; // 'classified' | 'product' | 'service'

  @Column({ type: 'int', nullable: true })
  offerEntityId: number | null;

  // For replies — parentId = null means top-level comment
  @ManyToOne(() => PostComment, (c) => c.replies, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn()
  parent: PostComment | null;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @OneToMany(() => PostComment, (c) => c.parent)
  replies: PostComment[];

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  // ── NEW: Commerce Comment System columns ──────────────────────────────────
  @Column({ type: 'varchar', length: 20, default: PostCommentType.COMMENT })
  type: PostCommentType;

  // Only meaningful when type === REVIEW
  @Column({ type: 'smallint', nullable: true })
  rating: number | null;

  @Column({ type: 'jsonb', nullable: true })
  media: CommentMediaItem[] | null;

  @Column({ type: 'varchar', length: 20, default: PurchaseVerification.NONE })
  purchaseVerification: PurchaseVerification;

  @Column({ default: 0 })
  helpfulCount: number;

  // AI_SUMMARY rows render pinned above the filter tabs.
  @Column({ default: false })
  isPinned: boolean;

  // Kentexa AI moderation verdict — set on create by the Comment Workflow.
  // null means never checked (e.g. AI failure, fail-open).
  @Column({ type: 'varchar', length: 20, nullable: true })
  moderationFlag: 'clean' | 'flagged' | 'blocked' | null;

  @Column({ type: 'text', nullable: true })
  moderationReason: string | null;
  // ── end NEW ─────────────────────────────────────────────────────────────

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
