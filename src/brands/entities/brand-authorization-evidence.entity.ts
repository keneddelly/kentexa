import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { BusinessBrandAuthorization } from './business-brand-authorization.entity';

// Stores a private Cloudinary reference only — same pattern as
// DigitalProductAsset/upload.controller.ts's uploadDigitalFile(): the
// publicId is meaningless without a signed URL, minted on demand server-
// side only for the submitting business's authorized staff or an admin
// reviewer. Never a plain public url column, unlike BusinessDocument
// (identity module) — authorization evidence (distributor letters,
// certificates) must not be publicly exposed.
@Entity()
export class BrandAuthorizationEvidence {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => BusinessBrandAuthorization, { onDelete: 'CASCADE' })
  @JoinColumn()
  authorization: BusinessBrandAuthorization;

  @Column({ type: 'varchar' })
  documentType: string;
  // 'distributor_letter' | 'certificate' | 'dealership_agreement' |
  // 'business_document' | 'other'

  @Column({ type: 'varchar' })
  cloudinaryPublicId: string;

  @Column({ type: 'varchar' })
  format: string;

  @Column({ type: 'int' })
  uploadedByUserId: number;

  @CreateDateColumn()
  createdAt: Date;
}
