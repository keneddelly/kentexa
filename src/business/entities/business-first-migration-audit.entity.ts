import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Additive audit record written only by the Business-First Stage 1 backfill
 * tool (src/database/backfill-business-first-foundation.ts), never by the
 * schema migration itself. Mirrors role-migration-audit.entity.ts's own
 * shape and role (Phase A's equivalent record for the AccountRole backfill).
 */
@Entity('business_first_migration_audit')
@Index('IDX_business_first_migration_audit_code', ['code'])
@Index('IDX_business_first_migration_audit_user', ['userId'])
export class BusinessFirstMigrationAudit {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar' })
  severity: string; // 'warning' | 'error'

  @Column({ type: 'varchar' })
  code: string;

  @Column({ type: 'varchar' })
  sourceType: string; // 'business' | 'seller_profile' | 'commerce_profile_member'

  @Column({ type: 'int', nullable: true })
  sourceId: number | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
