import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ClassifiedStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  EXPIRED = 'expired',
}

export enum ClassifiedCategory {
  ELECTRONICS = 'electronics',
  FASHION = 'fashion',
  VEHICLES = 'vehicles',
  FOOD = 'food',
  HOME_GARDEN = 'home_garden',
  HEALTH_BEAUTY = 'health_beauty',
  BABY_KIDS = 'baby_kids',
  SPORTS = 'sports',
  AGRICULTURE = 'agriculture',
  SECURITY = 'security',
  BOOKS = 'books',
  ARTS = 'arts',
  GENERAL = 'general',
  PROPERTY = 'property',
  SERVICES = 'services',
}

@Entity()
export class Classified {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: ClassifiedCategory,
    default: ClassifiedCategory.GENERAL,
  })
  category: ClassifiedCategory;

  // ── Subcategory (free text, driven by frontend dropdown per category) ──
  @Column({ type: 'text', nullable: true })
  subcategory: string | null;

  @Column({
    type: 'enum',
    enum: ClassifiedStatus,
    default: ClassifiedStatus.ACTIVE,
  })
  status: ClassifiedStatus;

  @Column({ nullable: true })
  location: string;

  @Column('simple-array', { nullable: true })
  images: string[];

  // ── Specs: key-value pairs specific to subcategory ──
  // e.g. { "Make": "Toyota", "Year": "2020", "Mileage": "45,000 km" }
  @Column({ type: 'json', nullable: true })
  specs: Record<string, string> | null;

  // ── Condition: new / used / refurbished ──
  @Column({ type: 'text', nullable: true })
  condition: string | null;

  // ── Negotiable flag ──
  @Column({ type: 'boolean', default: false })
  isNegotiable: boolean;

  @Column({ type: 'varchar', nullable: true, default: 'direct' })
  deliveryMethod: string | null;

  @Column({ type: 'boolean', default: false })
  isFreeListing: boolean;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  seller: User;

  // ── Flash Sale ───────────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  isFlashSale: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  flashSalePrice: number | null; // discounted price

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  originalPrice: number | null; // original price (shown crossed out)

  @Column({ type: 'timestamp', nullable: true })
  flashSaleEndsAt: Date | null; // countdown target

  @Column({ type: 'int', nullable: true })
  flashSaleQuantity: number | null; // limited units

  @Column({ type: 'int', default: 0 })
  flashSaleSold: number; // units sold so far

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
