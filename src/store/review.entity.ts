import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';

@Entity()
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  buyer: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  seller: User;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  order: Order | null;

  // Which specific CommerceProfile earned this review — plain nullable id,
  // not a relation (same pattern as BusinessFeedItem.commerceProfileId).
  // Null on every review that predates profile-scoped reviews; never
  // retro-tagged, so a business's Reviews tab only ever shows reviews
  // written after this field existed, not a guess at old data.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  @Column({ type: 'int' })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'boolean', default: true })
  verified: boolean; // verified purchase

  @CreateDateColumn()
  createdAt: Date;
}
