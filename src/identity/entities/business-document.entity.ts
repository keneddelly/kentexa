import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { SellerProfile } from '../../seller/entities/seller-profile.entity';

// Lives in the identity module (verification data) rather than the seller
// module (operational seller data) — a SellerProfile can have several of
// these (BRELA cert, TIN cert, license), so this is a list, not a single
// field, unlike IdentityProfile.idDocumentImageUrl.
@Entity()
export class BusinessDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SellerProfile, { eager: false, onDelete: 'CASCADE' })
  sellerProfile: SellerProfile;

  @Column({ type: 'varchar' })
  documentType: 'brela' | 'tin' | 'license' | 'other';

  @Column({ type: 'varchar' })
  url: string;

  @CreateDateColumn()
  createdAt: Date;
}
