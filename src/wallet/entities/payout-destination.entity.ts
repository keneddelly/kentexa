import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum PayoutDestinationStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  DISABLED = 'disabled',
  SUPERSEDED = 'superseded',
}

export const PAYOUT_METHODS = ['mpesa', 'airtel_money', 'tigo_pesa', 'halotel', 'bank'] as const;

/**
 * I2G: workspace-scoped, append-only Business payout destination. Never copied
 * from User.payout*. One ACTIVE row per workspace (UQ_payout_destination_active).
 * `usableFrom` / `coolingOffSeconds` record the cooling-off that configuration
 * applied when the destination was verified -- the duration is policy, not a
 * schema constant.
 */
@Entity('payout_destination')
export class PayoutDestination {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workspaceId: number;

  @Column({ type: 'varchar' })
  method: string;

  @Column({ type: 'varchar' })
  accountName: string;

  @Column({ type: 'varchar' })
  accountNumber: string;

  @Column({ type: 'varchar', nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar' })
  status: PayoutDestinationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  usableFrom: Date | null;

  @Column({ type: 'int', nullable: true })
  coolingOffSeconds: number | null;

  @Column({ type: 'varchar', nullable: true })
  verificationMethod: string | null;

  @Column({ type: 'varchar', nullable: true })
  verificationRef: string | null;

  @Column({ type: 'int' })
  createdByUserId: number;

  @Column({ type: 'int', nullable: true })
  verifiedByUserId: number | null;

  @Column({ type: 'int', nullable: true })
  disabledByUserId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  disabledAt: Date | null;
}
