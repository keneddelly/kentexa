import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ConversationParticipant } from './conversation-participant.entity';

/**
 * Per-participant read/pin/mute/archive state -- the eventual replacement
 * for Conversation.unreadCount/buyerUnreadCount/sellerPinned/sellerMuted/
 * buyerPinned/buyerMuted, generalized from "seller side vs buyer side" to
 * "this specific resolved participant." Dual-written alongside those
 * legacy columns during Stage 2 (see ConversationService); NOT read from
 * by default yet -- gated behind SCOPED_UNREAD_READ.
 */
@Entity('conversation_participant_state')
export class ConversationParticipantState {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ConversationParticipant, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_participant_id' })
  conversationParticipant: ConversationParticipant;

  @Index('idx_conv_participant_state_unique_participant', { unique: true })
  @Column({ name: 'conversation_participant_id' })
  conversationParticipantId: number;

  @Column({ type: 'int', nullable: true })
  lastReadMessageId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt: Date | null;

  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  @Column({ type: 'boolean', default: false })
  pinned: boolean;

  @Column({ type: 'boolean', default: false })
  muted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
