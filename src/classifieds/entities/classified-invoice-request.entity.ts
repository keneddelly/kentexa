import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Classified } from './classified.entity';

export enum ClassifiedInvoiceStatus {
  PENDING = 'pending',
  SENT = 'sent',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('classified_invoice_request')
export class ClassifiedInvoiceRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Classified, {
    eager: true,
    onDelete: 'CASCADE',
    nullable: true,
  })
  classified: Classified;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE', nullable: true })
  buyer: User;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE', nullable: true })
  seller: User;

  @Column({ type: 'text', nullable: true })
  buyerMessage: string | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'text', nullable: true })
  invoiceDescription: string | null;

  @Column({ type: 'text', nullable: true })
  sellerNotes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({
    type: 'enum',
    enum: ClassifiedInvoiceStatus,
    default: ClassifiedInvoiceStatus.PENDING,
  })
  status: ClassifiedInvoiceStatus;

  // ✅ explicit varchar to prevent TypeORM misreading the type
  @Column({ type: 'varchar', unique: true, nullable: true })
  invoiceNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'text', nullable: true })
  transactionReference: string | null;

  // ── Shipping — set by the seller once the invoice is paid, so a real
  // trackable Order can be created and the buyer/seller both see it ──────────
  @Column({ type: 'varchar', nullable: true })
  shippingMethod: string | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  platformFee: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  sellerAmount: number | null;

  // The real Order created once shipping is set — lets the UI show the
  // resulting tracking number (KTX-ORD-{linkedOrderId}) without a join.
  @Column({ type: 'int', nullable: true })
  linkedOrderId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
