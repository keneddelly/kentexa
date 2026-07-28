/**
 * PickupPoint — agent-designated collection spot
 * Place at: src/pickup-points/entities/pickup-point.entity.ts
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
import { Agent } from '../../agents/entities/agent.entity';

export enum PickupPointStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BUSY = 'busy',
}

@Entity('pickup_point')
export class PickupPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn()
  agent: Agent;

  @Column({ type: 'int' })
  agentId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar' })
  name: string; // "KenteXa Pickup — Kariakoo"

  @Column({ type: 'text' })
  address: string; // full street address

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  landmark: string | null; // "Karibu na Total petrol station"

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  openHours: string | null; // "Jumatatu-Ijumaa 8am-6pm"

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({
    type: 'enum',
    enum: PickupPointStatus,
    default: PickupPointStatus.ACTIVE,
  })
  status: PickupPointStatus;

  @Column({ type: 'int', default: 0 })
  totalPickups: number; // lifetime pickups handled

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
