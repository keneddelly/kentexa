import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/entities/user.entity';

export enum MessageSenderType {
  SELLER = 'seller',
  CUSTOMER = 'customer',
  SYSTEM = 'system', // auto messages: order created, payment received etc
  EMPLOYEE = 'employee',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  PRODUCT = 'product', // product card shared in chat
  ORDER = 'order', // order created from chat
  INVOICE = 'invoice', // invoice sent
  NOTE = 'note', // internal seller note (not visible to customer)
  SERVICE = 'service', // service listing shared in chat
  JOB = 'job', // service job request / accept / decline
}

@Entity('conversation_message')
export class ConversationMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Conversation, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'conversation_id' })
  conversationId: number;

  // ── Sender ────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar' })
  senderType: string; // MessageSenderType

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User | null;

  @Column({ name: 'sender_id', nullable: true })
  senderId: number | null;

  // ── Content ───────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', default: MessageType.TEXT })
  type: string;

  @Column({ type: 'text', nullable: true })
  content: string | null; // text message or caption

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  // Rich metadata for cards (product/order/invoice)
  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    // For product cards
    productId?: number;
    productName?: string;
    productPrice?: number;
    productImage?: string;
    // For order cards
    orderId?: number;
    orderStatus?: string;
    trackingNumber?: string;
    // For invoice cards
    invoiceNumber?: string;
    invoiceAmount?: number;
    invoiceUrl?: string;
  } | null;

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'boolean', default: false })
  isNote: boolean; // internal note — not shown to customer

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
