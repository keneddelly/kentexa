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
import { User } from '../../users/entities/user.entity';
import { BusinessCustomer } from './business-customer.entity';

export enum ConversationStatus {
  OPEN = 'open',
  PENDING = 'pending', // waiting for customer reply
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum ConversationChannel {
  KENTEXA = 'kentexa',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  MANUAL = 'manual',
}

// Application-level find-or-create (ConversationService.getOrCreateConversation)
// only checks-then-creates — a double-tap on "Message Seller" or a client
// retry after a slow/timed-out first request could still race past the
// findOne check before either insert commits. Two partial unique indexes
// close that at the DB level (Postgres treats every NULL as distinct in a
// plain multi-column UNIQUE, so a single constraint on
// (sellerId, customerId, commerceProfileId) would silently let unlimited
// commerceProfileId:NULL duplicates through — the single most common case,
// since most sellers/buyers never pass a specific profile at all):
//   - one seller+customer+specific-profile conversation
//   - one seller+customer conversation with no profile attached
@Index('idx_conversation_unique_with_profile', ['sellerId', 'customerId', 'commerceProfileId'], {
  unique: true,
  where: '"commerceProfileId" IS NOT NULL',
})
@Index('idx_conversation_unique_no_profile', ['sellerId', 'customerId'], {
  unique: true,
  where: '"commerceProfileId" IS NULL',
})
@Entity('conversation')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Parties ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: number;

  @ManyToOne(() => BusinessCustomer, { nullable: true, eager: false })
  @JoinColumn({ name: 'customer_id' })
  customer: BusinessCustomer | null;

  @Column({ name: 'customer_id', nullable: true })
  customerId: number | null;

  // Which of the seller's CommerceProfiles this conversation concerns —
  // plain nullable id (not a relation), same pattern as
  // Classified/BusinessFeedItem.commerceProfileId. A buyer messaging about
  // a personal-profile classified and separately about a business-profile
  // product from the same seller account must land in two conversations
  // that each show the correct identity, not one indistinguishable thread
  // keyed to the raw seller User row. Set once at creation, never changed.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  // Assigned team member
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User | null;

  @Column({ name: 'assigned_to_id', nullable: true })
  assignedToId: number | null;

  // ── Meta ──────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', default: ConversationStatus.OPEN })
  status: string;

  @Column({ type: 'varchar', default: ConversationChannel.KENTEXA })
  channel: string;

  @Column({ type: 'varchar', nullable: true })
  externalId: string | null; // WhatsApp thread ID, Instagram thread ID

  // ── Stats ─────────────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'int', default: 0 })
  unreadCount: number; // seller's unread messages (from customer)

  @Column({ type: 'int', default: 0 })
  buyerUnreadCount: number; // buyer's unread messages (from seller)

  // Pin/mute are personal organizational preferences, not facts about the
  // conversation itself — split seller/buyer exactly like unreadCount/
  // buyerUnreadCount above, so a seller pinning a thread never pins it on
  // the buyer's side of the same row, and vice versa.
  @Column({ type: 'boolean', default: false })
  sellerPinned: boolean;

  @Column({ type: 'boolean', default: false })
  sellerMuted: boolean;

  @Column({ type: 'boolean', default: false })
  buyerPinned: boolean;

  @Column({ type: 'boolean', default: false })
  buyerMuted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastMessagePreview: string | null;

  // ── Linked commerce objects ───────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  linkedOrderId: number | null;

  @Column({ type: 'int', nullable: true })
  linkedInvoiceId: number | null;

  // What listing this conversation is CURRENTLY about — unlike
  // commerceProfileId above (set once, never changed: which identity),
  // this is mutable and always overwritten to the most recent product/
  // classified/service a buyer messaged about, since one ongoing customer
  // relationship can naturally touch several listings over time (CLAUDE.md:
  // "Messages connect to context... product, service, order, invoice").
  // Denormalized title/image (not just a foreign id) so the inbox list row
  // can show a chip without an extra lookup per conversation, and so it
  // still displays correctly even if the listing is later deleted/sold.
  @Column({ type: 'varchar', nullable: true })
  linkedContextType: 'product' | 'classified' | 'service' | null;

  @Column({ type: 'int', nullable: true })
  linkedContextId: number | null;

  @Column({ type: 'varchar', nullable: true })
  linkedContextTitle: string | null;

  @Column({ type: 'varchar', nullable: true })
  linkedContextImage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
