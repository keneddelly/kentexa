import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from './products.entity';

@Entity()
export class ProductReview {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewerId' })
  reviewer: User;

  @Column()
  reviewerId: number;

  @Column({ type: 'int' })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'boolean', default: false })
  isVerifiedPurchase: boolean;

  @Column({ type: 'int', nullable: true })
  orderId: number | null;

  // Which specific CommerceProfile (the seller's business) earned this
  // review — same additive, never-retro-tagged pattern as Review.
  // commerceProfileId and BusinessFeedItem.commerceProfileId.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
