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

  // Was a strict Postgres enum (15 fixed values) — converted to validated
  // text (validation now lives in the DTO, against categories.data.ts) so
  // the category list can grow without a schema migration each time.
  @Column({ type: 'varchar', default: 'general' })
  category: string;

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

  // Which specific CommerceProfile this was posted AS — plain nullable id
  // (not a relation), same pattern as BusinessFeedItem.commerceProfileId.
  // A classified posted while the account's personal profile is active
  // must stay attributed to that personal identity, not silently resolve
  // to the account's business brand — null on classifieds that predate
  // this column, which keep resolving to the business identity as before.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  // Optional per-listing contact override. A side-hustle classified posted
  // from a personal profile often needs a different number than the
  // account's main (business) contact — CommerceProfile itself has no
  // phone/whatsapp field for any type, so this lives on the listing
  // itself rather than requiring a schema change to every profile type.
  // Null means "use the seller's account phone," same as before this
  // column existed.
  @Column({ type: 'varchar', nullable: true })
  contactPhone: string | null;

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
