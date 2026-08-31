import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Product } from './products.entity';

export enum ProductSerialStatus {
  IN_STOCK = 'in_stock',
  SOLD = 'sold',
  REPORTED_LOST = 'reported_lost',
  REPORTED_STOLEN = 'reported_stolen',
  DEACTIVATED = 'deactivated',
}

// One row per physical unit — a genuinely new concept in Kentexa (Product.
// stock/Order.quantity/SaleItem.quantity are all aggregate counts, nowhere
// else is there a per-unit identity). Own table rather than columns on
// Product itself, same reasoning as DigitalProductAsset. Registering a
// serial here is what lets a customer scan/type it on the public
// GET /products/verify/:code page and see it's a genuine unit sold by an
// authorized business — the direct customer-facing payoff of the Brand &
// Authorization Network existing at all.
@Entity('product_serial')
export class ProductSerial {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  @Column()
  productId: number;

  // Globally unique across the whole platform, not just per-product/seller
  // — a duplicate-registration attempt (the same serial already registered
  // to a different product) is itself a fraud signal, not a legitimate
  // case to silently allow. Normalized (trimmed + uppercased) before write.
  @Column({ type: 'varchar', unique: true })
  serialNumber: string;

  @Column({
    type: 'enum',
    enum: ProductSerialStatus,
    default: ProductSerialStatus.IN_STOCK,
  })
  status: ProductSerialStatus;

  // What consumed this unit — an Order id or a Sale id, or null while still
  // in stock. Plain string+id pair, not a relation, mirroring
  // InventoryMovement.referenceType/referenceId since the referenced table
  // varies by type.
  @Column({ type: 'varchar', nullable: true })
  soldReferenceType: 'order' | 'sale' | null;

  @Column({ type: 'int', nullable: true })
  soldReferenceId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  soldAt: Date | null;

  @Column({ type: 'int' })
  registeredByUserId: number;

  @CreateDateColumn()
  createdAt: Date;
}
