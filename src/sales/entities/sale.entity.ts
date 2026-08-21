import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BusinessCustomer } from '../../business/entities/business-customer.entity';
import { SaleItem } from './sale-item.entity';

// Extensible on purpose — Order already covers KENTEXA_ONLINE, so this enum
// only needs the channels a Sale itself can represent. Adding a future
// channel (e.g. a marketplace integration) means adding one value here,
// nothing structural.
export enum SaleChannel {
  LOCAL_POS = 'local_pos',
  MANUAL = 'manual',
}

export enum SaleStatus {
  COMPLETED = 'completed',
  VOIDED = 'voided',
  REFUNDED = 'refunded',
}

export enum SalePaymentMethod {
  CASH = 'cash',
  MPESA = 'mpesa',
  AIRTEL_MONEY = 'airtel_money',
  TIGO_PESA = 'tigo_pesa',
  HALOPESA = 'halopesa',
  BANK = 'bank',
  OTHER = 'other',
}

// A multi-item local-shop or manual transaction — deliberately separate
// from Order, which is (and stays) a single-product online-checkout
// record. Both ultimately move the same Product.stock through
// InventoryService, so there's one inventory, not two.
@Entity('sale')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  seller: User;

  @Column()
  sellerId: number;

  @Column({ type: 'enum', enum: SaleChannel })
  channel: SaleChannel;

  @Column({ unique: true })
  receiptNumber: string;

  // A walk-in customer often isn't a Kentexa account — BusinessCustomer
  // (already used by the seller inbox/CRM) covers that, with plain-text
  // fallbacks for a truly anonymous sale.
  @ManyToOne(() => BusinessCustomer, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn()
  customer: BusinessCustomer | null;

  @Column({ type: 'int', nullable: true })
  customerId: number | null;

  @Column({ type: 'varchar', nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerPhone: string | null;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true, eager: true })
  items: SaleItem[];

  @Column('decimal', { precision: 12, scale: 2 })
  subtotal: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  total: number;

  @Column({ type: 'enum', enum: SalePaymentMethod })
  paymentMethod: SalePaymentMethod;

  @Column('decimal', { precision: 12, scale: 2 })
  amountPaid: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  changeDue: number;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
  status: SaleStatus;

  @Column({ type: 'varchar', nullable: true })
  voidedReason: string | null;

  // Set when this already-paid sale gets shipped instead of picked up in
  // person — see SuperAgentsService.createSellerShipment()'s saleId
  // handling. Lets the dashboard show "Sale #X — shipped, tracking Y"
  // instead of the sale and the resulting parcel being invisible to
  // each other.
  @Column({ type: 'varchar', nullable: true })
  shipmentTrackingNumber: string | null;

  // The cashier — distinct from `seller`, which is the business the sale
  // belongs to (an invited team member operates the POS on the seller's
  // behalf, same owner-vs-staff distinction as everywhere else in
  // business/*).
  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
