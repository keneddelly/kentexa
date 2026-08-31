import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// A distributor may represent multiple brands (see BrandDistributor), and a
// brand may have multiple distributors (regional/category split) — this
// entity is deliberately standalone, not owned by a single Brand row.
// commerceProfileId is a plain nullable int (not a relation), matching the
// zero-import-coupling convention CommerceProfile-adjacent entities already
// use platform-wide — set only when the distributor also operates a real
// Kentexa storefront.
@Entity()
export class Distributor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  contactInfo: { email?: string; phone?: string; address?: string } | null;

  // Same free-form convention as Brand.verificationStatus.
  @Column({ type: 'varchar', default: 'unverified' })
  verificationStatus: string; // 'unverified' | 'verified'

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
