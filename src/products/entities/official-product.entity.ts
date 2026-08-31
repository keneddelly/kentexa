import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// The brand's own canonical catalog entry (e.g. LG "OLED55C4") — distinct
// from a Product row, which is always one SELLER's own listing/offer
// against it (their price, their stock, their photos). Multiple sellers'
// Product rows can share the same officialProductId, which is what lets
// Kentexa compare their offers side by side (see
// ProductsService.findOne()'s otherOffers computation). Admin-managed for
// now — see src/brands/brands.module.ts's own note on deferring a real
// brand/distributor-owned account until one is actually onboarded; this
// follows the identical reasoning.
@Entity()
export class OfficialProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  brandId: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  category: string;

  @Column({ type: 'text', nullable: true })
  subcategory: string | null;

  @Column({ type: 'jsonb', nullable: true })
  officialSpecs: Record<string, string> | null;

  @Column({ type: 'simple-array', nullable: true })
  officialImages: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
