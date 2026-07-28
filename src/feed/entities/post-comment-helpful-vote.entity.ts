/**
 * post-comment-helpful-vote.entity.ts
 * Place at: src/feed/entities/post-comment-helpful-vote.entity.ts
 *
 * One row per (comment, user) — lets a user toggle "Helpful" on/off exactly
 * once per review. This is a genuinely new concept (no existing table
 * tracks per-comment votes — PostEngagement tracks save/share/comment
 * counts at the post/entity level, not per individual comment), so it's
 * additive rather than a duplicate of anything that already exists.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';

@Entity('post_comment_helpful_vote')
@Unique(['commentId', 'userId'])
@Index(['commentId'])
export class PostCommentHelpfulVote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  commentId: number; // FK -> post_comment.id

  @Column()
  userId: number;

  @CreateDateColumn()
  createdAt: Date;
}
