/**
 * SuperAgentCashRemittance — Stage 3S-C7 Part B-A: an immutable record that
 * a Super Agent physically handed back cash they collected on the
 * platform's behalf. `amount` is always the sum of the
 * SuperAgentCashRemittanceAllocation rows it covers (full-collection-only
 * allocation -- see that entity's own header comment for why), never
 * caller-supplied independently of them.
 *
 * `idempotencyKey` is caller-supplied (a network retry must reuse the same
 * key) and independently unique-constrained at the DB level, mirroring
 * SuperAgentCashCollection's own established convention.
 *
 * Immutable via the same BEFORE UPDATE/DELETE trigger technique this
 * lineage already established.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Check } from 'typeorm';

@Entity('super_agent_cash_remittance')
@Index('UQ_super_agent_cash_remittance_idempotency', ['idempotencyKey'], { unique: true })
@Check('CHK_super_agent_cash_remittance_amount_positive', 'amount > 0')
export class SuperAgentCashRemittance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  superAgentId: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int' })
  actorUserId: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  evidenceRef: string | null;

  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string;

  @CreateDateColumn() createdAt: Date;
}
