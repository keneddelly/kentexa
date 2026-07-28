/**
 * Wishlist entity — saved classifieds/products per user
 * Place at: src/wishlist/entities/wishlist.entity.ts
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Classified } from '../../classifieds/entities/classified.entity';

@Entity('wishlist')
export class Wishlist {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => Classified, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  classified: Classified;

  @Column({ type: 'int', nullable: true })
  classifiedId: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  savedAt: Date;
}
