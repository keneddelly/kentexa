import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAYMENT_PROCESSING = 'payment_processing',
  PAID = 'paid',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  invoiceNumber: string;

  @OneToOne(() => Order, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  // ✅ Nullable — offline orders have no buyer User account
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'CASCADE' })
  buyer: User | null;

  // Plain name/phone for who actually paid — set for manual/offline
  // payments (recordManualPayment()), where there's usually no `buyer`
  // User account to reference at all. Previously this information only
  // ever existed transiently inside the request that sent the payment
  // SMS and was never persisted anywhere, so the receipt (this row) had
  // no way to show who paid after the fact.
  @Column({ type: 'text', nullable: true })
  payerName: string | null;

  @Column({ type: 'text', nullable: true })
  payerPhone: string | null;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.AWAITING_PAYMENT,
  })
  status: InvoiceStatus;

  @Column({ type: 'text', nullable: true })
  receiptNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  transactionReference: string | null;

  @Column({ type: 'text', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
