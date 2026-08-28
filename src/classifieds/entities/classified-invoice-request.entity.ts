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

  // ── Structured delivery location (LocationPicker) — previously the
  // delivery address only ever existed as free text folded into
  // buyerMessage, with no way to actually search/match/verify it against
  // Kentexa's real region/district/ward data the way every other
  // shipping-adjacent form (SellerShipment.js, BecomeSeller.js) already
  // does. Same naming convention as SellerShipment.js's own submit body.
  @Column({ type: 'int', nullable: true })
  regionId: number | null;

  @Column({ type: 'varchar', nullable: true })
  regionName: string | null;

  @Column({ type: 'int', nullable: true })
  districtId: number | null;

  @Column({ type: 'varchar', nullable: true })
  districtName: string | null;

  @Column({ type: 'int', nullable: true })
  wardId: number | null;

  @Column({ type: 'varchar', nullable: true })
  wardName: string | null;

  // Street/landmark detail only — the region/district/ward columns above
  // now carry the structured part that used to live only inside
  // buyerMessage's free-text blob.
  @Column({ type: 'text', nullable: true })
  deliveryAddress: string | null;

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

  // ── Set by setShippingMethod() once the seller picks a shipping method
  // and the resulting Order is created — these previously had no matching
  // column, so TypeORM silently dropped every write and the values only
  // ever existed in that one API response.
  @Column({ type: 'varchar', nullable: true })
  shippingMethod: string | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  platformFee: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  sellerAmount: number | null;

  @Column({ type: 'int', nullable: true })
  linkedOrderId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
