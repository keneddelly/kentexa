import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// A lightweight grouping row only — holds nothing pricing-related. Each
// real variant (White/M, Red/M, ...) stays its own independent Product
// row with its own price/stock/images; this just records that a set of
// Product rows are variants of the same underlying item. See
// Product.variantGroupId's own comment for why Product itself was never
// restructured to hold this directly.
@Entity()
export class ProductVariantGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'int', nullable: true })
  brandId: number | null;

  @Column({ type: 'int', nullable: true })
  officialProductId: number | null;

  @Column({ type: 'text' })
  category: string;

  @Column({ type: 'text', nullable: true })
  subcategory: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
