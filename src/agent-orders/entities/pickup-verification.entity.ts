import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Agent } from '../../agents/entities/agent.entity';
import { User } from '../../users/entities/user.entity';

@Entity()
export class PickupVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, { eager: true })
  order: Order;

  @ManyToOne(() => Agent, { eager: true })
  agent: Agent;

  @ManyToOne(() => User, { eager: true })
  customer: User;

  @Column({ type: 'text' })
  otpCode: string;

  @Column({ type: 'timestamp' })
  otpExpiresAt: Date;

  @Column({ default: 0 })
  otpAttempts: number;

  @Column({ default: 3 })
  maxAttempts: number;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}