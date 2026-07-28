import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * BodaRateCard — KenteXa controlled boda fee pricing for Dar es Salaam
 * Admin editable via /admin/boda-rates
 * Used to calculate boda fee at checkout based on buyer zone + item weight
 */
@Entity('boda_rate_card')
export class BodaRateCard {
  @PrimaryGeneratedColumn()
  id: number;

  // Unique key for this rate — e.g. 'base', 'zone_1', 'weight_2_5'
  @Column({ unique: true })
  rateKey: string;

  // Human readable label
  @Column()
  label: string;

  // Category: 'base' | 'zone' | 'weight'
  @Column()
  category: string;

  // The fee amount in TZS
  @Column('int', { default: 0 })
  fee: number;

  // For zone rates: address keywords that trigger this zone
  @Column('simple-array', { nullable: true })
  keywords: string[];

  // For zone rates: sort order (zone 1 closest, zone 4 furthest)
  @Column('int', { default: 0 })
  sortOrder: number;

  // For weight rates: min and max kg for this tier
  @Column('decimal', { nullable: true, precision: 6, scale: 2 })
  weightMin: number | null;

  @Column('decimal', { nullable: true, precision: 6, scale: 2 })
  weightMax: number | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
