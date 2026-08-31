import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Product } from '../../products/entities/products.entity';

export enum WarrantyRegistrationStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  VOID = 'void',
}

// A buyer's warranty on one completed purchase — spec §15. Always a
// manual buyer action (see WarrantyService.register()), never auto-
// created at order-delivery time, keeping this fully out of
// OrdersService's transaction-critical delivery/completion code path
// (same reasoning Phase D's serial assignment already established).
//
// durationMonths/expiresAt are resolved ONCE at registration time from
// Product.warrantyMonths ?? Brand.defaultWarrantyMonths and never
// recomputed — an already-issued warranty's terms must stay fixed even
// if the product's or brand's warranty policy changes later. Same
// snapshot posture as Order.brandNameSnapshot.
@Entity('warranty_registration')
export class WarrantyRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  @Column({ unique: true })
  orderId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  @Column()
  productId: number;

  @Column()
  buyerId: number;

  // Snapshotted from order.seller.id at registration time — claim review
  // access stays tied to whoever actually sold this unit, even if the
  // account's own seller status changes later.
  @Column()
  sellerId: number;

  // Snapshotted from order.brandId — null for an unbranded product (which
  // simply can't carry a warranty in this system).
  @Column({ type: 'int', nullable: true })
  brandId: number | null;

  // Soft cross-reference to a Phase D ProductSerial — plain string, not a
  // hard FK. Not every seller uses serial tracking, so this is never a
  // registration requirement, only an optional extra identifier.
  @Column({ type: 'varchar', nullable: true })
  serialNumber: string | null;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'int' })
  durationMonths: number;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({
    type: 'enum',
    enum: WarrantyRegistrationStatus,
    default: WarrantyRegistrationStatus.ACTIVE,
  })
  status: WarrantyRegistrationStatus;

  @CreateDateColumn()
  createdAt: Date;
}
