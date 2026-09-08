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

// Stage 2 communication isolation: whether this conversation's ownership
// has been resolved to a specific active-role/workspace principal.
// RESOLVED = the ownerWorkspaceType/Id below (or a real ConversationParticipant
// row) is trustworthy. Existing rows default to LEGACY_UNSCOPED until the
// historical classifier runs against them (see ConversationClassifierService)
// -- never guessed automatically. AMBIGUOUS/LEGACY_UNSCOPED conversations
// are quarantined from scoped reads (SCOPED_CONVERSATION_READ) until
// resolved; they remain fully visible through the existing legacy read path.
export enum ConversationClassificationStatus {
  RESOLVED = 'resolved',
  ACCOUNT_WIDE = 'account_wide',
  EXTERNAL_CONTACT = 'external_contact',
  AMBIGUOUS = 'ambiguous',
  LEGACY_UNSCOPED = 'legacy_unscoped',
}

// Application-level find-or-create (ConversationService.getOrCreateConversation)
// only checks-then-creates — a double-tap on "Message Seller" or a client
// retry after a slow/timed-out first request could still race past the
// findOne check before either insert commits. Four partial unique indexes
// close that at the DB level (Postgres treats every NULL as distinct in a
// plain multi-column UNIQUE, so a single constraint on
// (sellerId, customerId, commerceProfileId) would silently let unlimited
// commerceProfileId:NULL duplicates through — the single most common case,
// since most sellers/buyers never pass a specific profile at all).
//
// Communication canonicality fix (migration
// AddConversationOperationalOwnerUniqueness): every User's operational
// identities (Seller, Super Agent, Transport Provider, Agent) share the
// same seller_id (User.id), so the original two indexes let a buyer
// messaging two different operational identities of the same person
// collapse onto one Conversation row. The four indexes below split first
// on whether ownerWorkspaceType is resolved (a Stage-2-classified
// operational conversation) or NULL (every pre-Stage-2 LEGACY_UNSCOPED
// row, and any genuinely account-scope/personal conversation, which never
// gets an operational owner by design) — only the resolved-owner case
// folds ownerWorkspaceType/ownerWorkspaceId into uniqueness; the NULL case
// is byte-for-byte the original two-index shape, so legacy/personal rows
// are entirely unaffected by this change:
//   - ownerWorkspaceType resolved + specific commerceProfileId
//   - ownerWorkspaceType resolved + no commerceProfileId
//   - ownerWorkspaceType NULL (legacy/personal) + specific commerceProfileId
//   - ownerWorkspaceType NULL (legacy/personal) + no commerceProfileId
@Index('idx_conversation_unique_workspace_with_profile', ['sellerId', 'customerId', 'ownerWorkspaceType', 'ownerWorkspaceId', 'commerceProfileId'], {
  unique: true,
  where: '"ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NOT NULL',
})
@Index('idx_conversation_unique_workspace_no_profile', ['sellerId', 'customerId', 'ownerWorkspaceType', 'ownerWorkspaceId'], {
  unique: true,
  where: '"ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NULL',
})
@Index('idx_conversation_unique_legacy_with_profile', ['sellerId', 'customerId', 'commerceProfileId'], {
  unique: true,
  where: '"ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NOT NULL',
})
@Index('idx_conversation_unique_legacy_no_profile', ['sellerId', 'customerId'], {
  unique: true,
  where: '"ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NULL',
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

  // ── Stage 2: scope / ownership classification (additive, dual-write) ────────
  // scopeType/sourceType/sourceId describe WHAT created this thread ('seller_
  // buyer', 'order', 'dispute', ...) -- distinct from ownerWorkspace*, which
  // is WHO structurally owns the seller side (mirrors RoleContext.profileType/
  // profileId: 'seller_profile'|'agent'|'super_agent'|'transport_provider' +
  // id). Both are set at creation time by ConversationService for every
  // conversation created after Stage 2 shipped; never backfilled by guessing
  // for pre-existing rows (see ConversationClassificationStatus above).
  @Column({ type: 'varchar', nullable: true })
  scopeType: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceType: string | null;

  @Column({ type: 'int', nullable: true })
  sourceId: number | null;

  @Column({ type: 'varchar', nullable: true })
  ownerWorkspaceType: string | null;

  @Column({ type: 'int', nullable: true })
  ownerWorkspaceId: number | null;

  @Column({ type: 'varchar', default: ConversationClassificationStatus.LEGACY_UNSCOPED })
  classificationStatus: string;

  @Column({ type: 'varchar', nullable: true })
  classificationReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  classifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
