/**
 * SuperAgentCashCollection — Stage 3S-C5: the cash-desk collection
 * foundation for the Kentexa Van pilot.
 * Place at: src/super-agent-commission/entities/super-agent-cash-collection.entity.ts
 *
 * A payment-method-extensible record of money a Super Agent physically
 * collected -- CASH for this pilot (`paymentMethod` is a plain, CHECK-
 * constrained string, not an enum baked into business logic, so a future
 * electronic method can be added without redesigning this table). This is
 * deliberately NOT the same fact as a SuperAgentHandlingEarning: a customer
 * can pay cash without the collecting Super Agent ever earning a handling
 * commission (a plain delivery hand-off with no qualifying custody event
 * behind it), and a Super Agent can earn a handling commission on a parcel
 * whose payment happened entirely online. The two ledgers share `parcelId`
 * as their common join key for later reconciliation; neither is derived from
 * the other, and this gate does not build that reconciliation engine.
 *
 * `quoteId`/`priceContextAmount`/`priceContextCurrency` capture "the
 * accepted quote or frozen price context" the review requires -- `quoteId`
 * is a plain, unvalidated reference (TransportQuote lives in a different
 * module with its own relation graph; validating it is a deliberately
 * deferred follow-up, documented in this gate's own report) for when a
 * formal TransportQuote exists, while `priceContextAmount/Currency` are
 * always populated regardless, so "what was actually agreed" survives even
 * when there was never a formal quote (e.g. a walk-in counter sale).
 *
 * Immutable via the same BEFORE UPDATE/DELETE trigger technique
 * ParcelCustodyEvent/SuperAgentHandlingEarning already established --
 * "preserve original financial evidence" is a hard requirement, not a
 * suggestion. `idempotencyKey` is caller-supplied (a network retry must
 * reuse the same key) and independently unique-constrained at the DB level.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Check } from 'typeorm';

@Entity('super_agent_cash_collection')
@Index('UQ_super_agent_cash_collection_idempotency', ['idempotencyKey'], { unique: true })
// Declared here too, not just in the migration's raw SQL -- mirrors this
// lineage's own established fix for exactly this class of gap (RouteStop's
// CHK_route_stop_sequence, ParcelCustodyEvent's assignment-type CHECKs):
// synchronize:true test schemas build purely from entity decorators, so a
// migration-only CHECK is invisible to them (confirmed the hard way here --
// a mutation-testing pass caught the service-layer guard being removed, but
// found zero DB-level backstop until these were added).
@Check('CHK_super_agent_cash_collection_payment_method', `"paymentMethod" IN ('cash')`)
@Check('CHK_super_agent_cash_collection_reconciliation_status', `"reconciliationStatus" IN ('pending', 'reconciled')`)
// Post-review correction (Stage 3S-C5 re-review): "positive collected
// amounts, nonnegative agreed-price context" -- a legitimate cash collection
// can never be for a non-positive amount, and an agreed price context (even
// a free/zero one) can never be negative.
@Check('CHK_super_agent_cash_collection_amount_positive', '"collectedAmount" > 0')
@Check('CHK_super_agent_cash_collection_price_context_nonnegative', '"priceContextAmount" >= 0')
export class SuperAgentCashCollection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  parcelId: number;

  @Column({ type: 'int' })
  superAgentId: number;

  @Column({ type: 'int', nullable: true })
  quoteId: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceContextAmount: number;

  @Column({ type: 'varchar', length: 8 })
  priceContextCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  collectedAmount: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  @Column({ type: 'varchar', length: 24 })
  paymentMethod: string;

  @Column({ type: 'int' })
  actorUserId: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  receiptReference: string | null;

  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  reconciliationStatus: string;

  @CreateDateColumn() createdAt: Date;
}
