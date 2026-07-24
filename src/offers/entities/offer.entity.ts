/**
 * Offer entity — buyer makes price offer on a classified
 * Place at: src/offers/entities/offer.entity.ts
 */
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User }       from '../../users/entities/user.entity';
import { Classified } from '../../classifieds/entities/classified.entity';

export enum OfferStatus {
  PENDING   = 'pending',
  ACCEPTED  = 'accepted',
  DECLINED  = 'declined',
  COUNTERED = 'countered',
  EXPIRED   = 'expired',
}

@Entity('offer')
export class Offer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Classified, { onDelete: 'CASCADE' })
  @JoinColumn()
  classified: Classified;

  @Column({ type: 'int' })
  classifiedId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  buyer: User;

  @Column({ type: 'int' })
  buyerId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  seller: User;

  @Column({ type: 'int' })
  sellerId: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  offerAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  counterAmount: number | null;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status: OfferStatus;

  @Column({ type: 'text', nullable: true })
  buyerNote: string | null;

  @Column({ type: 'text', nullable: true })
  sellerNote: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}