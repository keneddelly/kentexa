/**
 * ReputationEvent — audit trail of every point change
 * Place at: src/reputation/entities/reputation-event.entity.ts
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

export enum ReputationEventType {
  ORDER_COMPLETED = 'order_completed',
  ORDER_CANCELLED = 'order_cancelled',
  DELIVERY_ON_TIME = 'delivery_on_time',
  DELIVERY_LATE = 'delivery_late',
  FIVE_STAR_RATING = 'five_star_rating',
  FOUR_STAR_RATING = 'four_star_rating',
  THREE_STAR_RATING = 'three_star_rating',
  TWO_STAR_RATING = 'two_star_rating',
  ONE_STAR_RATING = 'one_star_rating',
  DISPUTE_WON = 'dispute_won',
  DISPUTE_LOST = 'dispute_lost',
  FAST_RESPONSE = 'fast_response',
  SLOW_RESPONSE = 'slow_response',
  VERIFIED_PHONE = 'verified_phone',
  VERIFIED_ID = 'verified_id',
  VERIFIED_BUSINESS = 'verified_business',
  YEAR_ACTIVE = 'year_active',
  TRANSPORT_COMPLETED = 'transport_completed',
  TRANSPORT_CANCELLED = 'transport_cancelled',
}

// Points per event type
export const REPUTATION_POINTS: Record<ReputationEventType, number> = {
  [ReputationEventType.ORDER_COMPLETED]: 5,
  [ReputationEventType.ORDER_CANCELLED]: -2,
  [ReputationEventType.DELIVERY_ON_TIME]: 8,
  [ReputationEventType.DELIVERY_LATE]: -3,
  [ReputationEventType.FIVE_STAR_RATING]: 10,
  [ReputationEventType.FOUR_STAR_RATING]: 5,
  [ReputationEventType.THREE_STAR_RATING]: 1,
  [ReputationEventType.TWO_STAR_RATING]: -3,
  [ReputationEventType.ONE_STAR_RATING]: -8,
  [ReputationEventType.DISPUTE_WON]: 5,
  [ReputationEventType.DISPUTE_LOST]: -15,
  [ReputationEventType.FAST_RESPONSE]: 2,
  [ReputationEventType.SLOW_RESPONSE]: -1,
  [ReputationEventType.VERIFIED_PHONE]: 30,
  [ReputationEventType.VERIFIED_ID]: 50,
  [ReputationEventType.VERIFIED_BUSINESS]: 100,
  [ReputationEventType.YEAR_ACTIVE]: 20,
  [ReputationEventType.TRANSPORT_COMPLETED]: 6,
  [ReputationEventType.TRANSPORT_CANCELLED]: -3,
};

// Score bands
export const REPUTATION_TIERS = [
  {
    min: 900,
    name: 'KenteXa Elite',
    icon: '🏆',
    color: '#dc2626',
    bg: '#fee2e2',
  },
  {
    min: 600,
    name: 'Mshirika Mkuu',
    icon: '💎',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
  { min: 300, name: 'Mwaminifu', icon: '🌟', color: '#1d4ed8', bg: '#dbeafe' },
  {
    min: 100,
    name: 'Mwenye Imani',
    icon: '⭐',
    color: '#16a34a',
    bg: '#dcfce7',
  },
  { min: 0, name: 'Mpya', icon: '🌱', color: '#64748b', bg: '#f1f5f9' },
];

export const getTier = (score: number) =>
  REPUTATION_TIERS.find((t) => score >= t.min) || REPUTATION_TIERS[4];

@Entity('reputation_event')
export class ReputationEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: ReputationEventType })
  eventType: ReputationEventType;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'int' })
  scoreAfter: number; // running total after this event

  @Column({ type: 'varchar', nullable: true })
  sourceEntityType: string | null; // 'order' | 'delivery' | 'rating'

  @Column({ type: 'int', nullable: true })
  sourceEntityId: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
