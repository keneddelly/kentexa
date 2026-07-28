import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
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

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastMessagePreview: string | null;

  // ── Linked commerce objects ───────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  linkedOrderId: number | null;

  @Column({ type: 'int', nullable: true })
  linkedInvoiceId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
