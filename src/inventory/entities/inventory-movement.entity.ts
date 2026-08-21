import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/products.entity';

// Why a product's stock changed, for the BIS "why did this drop from 10 to
// 9" audit trail — every real stock mutation gets exactly one row here.
export enum InventoryMovementReason {
  PURCHASE = 'purchase', // stock brought in
  LOCAL_POS = 'local_pos', // sold at the physical shop
  KENTEXA_ONLINE = 'kentexa_online', // sold via a Kentexa online order
  MANUAL = 'manual', // recorded by a seller outside the normal flow
  RETURN = 'return', // customer returned it
  DAMAGED = 'damaged',
  ADJUSTMENT = 'adjustment', // manual correction, e.g. after a stock count
  ORDER_CANCELLED = 'order_cancelled', // stock restored — a pending order fell through
}

@Entity('inventory_movement')
export class InventoryMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  @Column()
  productId: number;

  // Positive = stock added, negative = stock removed. Never zero.
  @Column({ type: 'int' })
  delta: number;

  @Column({ type: 'enum', enum: InventoryMovementReason })
  reason: InventoryMovementReason;

  // What caused this movement — an Order id, a Sale id, or null for a
  // freeform manual adjustment. Plain string+id pair (not a relation) since
  // the referenced table varies by reason, same pattern as
  // Classified/Product.commerceProfileId elsewhere in this codebase.
  @Column({ type: 'varchar', nullable: true })
  referenceType: 'order' | 'sale' | null;

  @Column({ type: 'int', nullable: true })
  referenceId: number | null;

  // Stock right after this movement was applied — lets the audit log show
  // "10 -> 9" without having to replay every prior movement.
  @Column({ type: 'int' })
  balanceAfter: number;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
