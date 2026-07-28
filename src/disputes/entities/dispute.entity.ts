import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

export enum DisputeStatus {
  OPEN = 'open', // just raised
  REVIEWING = 'reviewing', // admin/arbitrator is looking at it
  RESOLVED = 'resolved', // decision made
  CLOSED = 'closed', // closed without resolution (e.g. withdrawn)
}

export enum DisputeResolution {
  FAVOUR_BUYER = 'favour_buyer', // refund buyer, seller loses escrow
  FAVOUR_SELLER = 'favour_seller', // release to seller, buyer claim rejected
  SPLIT = 'split', // partial refund agreed
  WITHDRAWN = 'withdrawn', // buyer/seller agreed outside KenteXa
}

export enum DisputeReason {
  NOT_DELIVERED = 'not_delivered', // buyer says never arrived
  WRONG_ITEM = 'wrong_item', // wrong product sent
  DAMAGED = 'damaged', // arrived broken
  NOT_AS_DESCRIBED = 'not_as_described', // doesn't match listing
  LATE_DELIVERY = 'late_delivery', // arrived too late
  MISSING_ITEMS = 'missing_items', // partial delivery
  OTHER = 'other',
}

/**
 * Dispute — raised when buyer or seller has a problem with an order.
 *
 * For online KenteXa orders: KenteXa holds escrow and can enforce resolution.
 * For offline orders: KenteXa provides the paper trail but cannot freeze funds.
 *
 * Flow:
 *   open → reviewing (admin sees it, optionally assigns arbitrator)
 *        → resolved (decision + resolution type recorded)
 *        → closed
 *
 * arbitratorId is nullable — admin handles disputes directly until a dedicated
 * arbitrator is assigned. Field exists for future: admin assigns trusted
 * Super Agent from a different region to avoid conflict of interest.
 */
@Entity('dispute')
export class Dispute {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  order: Order;

  // Who raised the dispute
  @ManyToOne(() => User, { eager: true, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  raisedBy: User;

  // Who resolves it — null = admin resolves directly
  // Future: admin assigns a trusted arbitrator from another region
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  arbitrator: User | null;

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'enum', enum: DisputeReason })
  reason: DisputeReason;

  @Column({ type: 'text' })
  description: string; // buyer/seller's account of what went wrong

  // Evidence
  @Column({ type: 'simple-array', nullable: true })
  evidencePhotos: string[] | null; // URLs of uploaded photos

  @Column({ type: 'text', nullable: true })
  sellerResponse: string | null; // seller's reply to the dispute

  @Column({ type: 'text', nullable: true })
  arbitratorNotes: string | null; // private notes from admin/arbitrator

  // Resolution
  @Column({ type: 'enum', enum: DisputeResolution, nullable: true })
  resolution: DisputeResolution | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string | null; // explanation of the decision

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  refundAmount: number | null; // if split or favour_buyer — how much refunded

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  assignedAt: Date | null; // when arbitrator was assigned

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
