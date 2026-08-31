import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// A brand (LG, Samsung, Hisense, ...) — deliberately generic, never
// hard-coded to a single manufacturer. This is Kentexa's own record of the
// brand's identity; it says nothing about which businesses may sell it —
// that relationship lives on BusinessBrandAuthorization. See the module's
// own top-of-file note in brands.module.ts for the full "Business != Brand
// != Authorization" reasoning.
@Entity()
export class Brand {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  legalName: string | null;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Column({ type: 'varchar', nullable: true })
  countryOfOrigin: string | null;

  @Column({ type: 'jsonb', nullable: true })
  officialContactInfo: { email?: string; phone?: string } | null;

  // Kentexa's own confidence that this row genuinely represents the real
  // company — separate from any business's authorization under it. A
  // brand can be 'verified' with zero authorized resellers yet, and a
  // business can (in theory, though the API won't offer it) be authorized
  // under an 'unverified' brand row an admin is still confirming.
  // Free-form varchar, not a hard enum, so a new value never needs a
  // migration — matches Announcement.priority's established convention.
  @Column({ type: 'varchar', default: 'unverified' })
  verificationStatus: string; // 'unverified' | 'verified'

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
