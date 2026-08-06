import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SellerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

@Entity()
export class SellerProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  businessName: string;

  @Column({ type: 'text', nullable: true })
  businessDescription: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ type: 'enum', enum: SellerStatus, default: SellerStatus.PENDING })
  status: SellerStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  // ── Identity (KYC) — reviewed by admin before approval ────────────────────
  @Column({ type: 'varchar', nullable: true })
  idType: string | null; // 'national_id' | 'voters_id' | 'passport' | 'driving_license'

  @Column({ type: 'varchar', nullable: true })
  idNumber: string | null;

  @Column({ type: 'text', nullable: true })
  idPhotoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  registrationNumber: string | null; // business registration cert, optional

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
