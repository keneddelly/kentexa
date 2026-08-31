import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Brand } from './brand.entity';
import { Distributor } from './distributor.entity';

// Many-to-many join with scope — a brand can have several distributors
// split by region/category, and one distributor can serve several brands.
// No unique constraint beyond the natural (brand, distributor, scope)
// combination, since the same pair can legitimately repeat for a
// different category or region.
@Entity()
export class BrandDistributor {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn()
  brand: Brand;

  @ManyToOne(() => Distributor, { onDelete: 'CASCADE' })
  @JoinColumn()
  distributor: Distributor;

  // Matches a key in categories/categories.data.ts. Null = every category.
  @Column({ type: 'varchar', nullable: true })
  categoryScope: string | null;

  @Column({ type: 'varchar', nullable: true })
  regionScope: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
