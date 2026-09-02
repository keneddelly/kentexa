import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Additive audit record written only by the Phase A backfill migration. */
@Entity('role_migration_audit')
@Index('IDX_role_migration_audit_code', ['code'])
@Index('IDX_role_migration_audit_user', ['userId'])
export class RoleMigrationAudit {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar' })
  severity: string;

  @Column({ type: 'varchar' })
  code: string;

  @Column({ type: 'varchar' })
  sourceProfileType: string;

  @Column({ type: 'int', nullable: true })
  sourceProfileId: number | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', nullable: true })
  roleType: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
