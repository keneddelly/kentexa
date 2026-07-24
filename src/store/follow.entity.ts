import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Unique,
} from 'typeorm';
import { User } from '../users/entities/user.entity';

@Entity()
@Unique(['follower', 'seller'])
export class Follow {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  follower: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  seller: User;

  @CreateDateColumn()
  createdAt: Date;
}