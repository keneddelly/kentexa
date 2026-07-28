import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Agent } from '../../agents/entities/agent.entity';
import { User } from '../../users/entities/user.entity';

export enum HandoverStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DISPUTED = 'disputed',
}

export enum ProductCondition {
  GOOD = 'good',
  DAMAGED = 'damaged',
  INCOMPLETE = 'incomplete',
}

@Entity()
export class OrderHandover {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Order, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  @ManyToOne(() => Agent, { eager: true })
  agent: Agent;

  @ManyToOne(() => User, { eager: true })
  seller: User;

  @Column({ unique: true })
  handoverCode: string;

  @Column({
    type: 'enum',
    enum: HandoverStatus,
    default: HandoverStatus.PENDING,
  })
  status: HandoverStatus;

  @Column({ type: 'enum', enum: ProductCondition, nullable: true })
  productCondition: ProductCondition | null;

  @Column({ type: 'text', nullable: true })
  sellerNotes: string | null;

  @Column({ type: 'text', nullable: true })
  agentNotes: string | null;

  @Column({ type: 'text', nullable: true })
  proofPhotoUrl: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sellerConfirmedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  agentConfirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
