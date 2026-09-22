import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only rollback journal for a future, separately approved workspace
 * reconciliation. Nothing in I2G writes to it.
 */
@Entity('financial_reconciliation_journal')
export class FinancialReconciliationJournal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  runId: string;

  @Column({ type: 'varchar' })
  entityType: 'order' | 'sale';

  @Column({ type: 'int' })
  entityId: number;

  @Column({ type: 'int', nullable: true })
  previousWorkspaceId: number | null;

  @Column({ type: 'int' })
  newWorkspaceId: number;

  @Column({ type: 'varchar' })
  rule: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  appliedAt: Date;
}
