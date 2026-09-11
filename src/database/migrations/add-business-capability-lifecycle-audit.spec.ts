import 'reflect-metadata';
import { readdirSync } from 'fs';
import { getMetadataArgsStorage } from 'typeorm';
import { BusinessCapability } from '../../business/entities/business-capability.entity';
import { User } from '../../users/entities/user.entity';
import { AddBusinessCapabilityLifecycleAudit1788262200000 } from './1788262200000-AddBusinessCapabilityLifecycleAudit';

describe('AddBusinessCapabilityLifecycleAudit1788262200000', () => {
  const run = async (direction: 'up' | 'down') => {
    const sql: string[] = [];
    const queryRunner = {
      query: jest.fn(async (statement: string) => {
        sql.push(statement.replace(/\s+/g, ' ').trim());
      }),
    } as any;
    const migration = new AddBusinessCapabilityLifecycleAudit1788262200000();
    await migration[direction](queryRunner);
    return sql;
  };

  it('UP adds only nullable lifecycle columns and SET NULL User foreign keys', async () => {
    const sql = await run('up');
    const joined = sql.join(' ');

    expect(joined).toContain('ADD COLUMN "suspendedByUserId" integer');
    expect(joined).toContain('ADD COLUMN "reactivatedAt" timestamp');
    expect(joined).toContain('ADD COLUMN "reactivatedByUserId" integer');
    expect(joined).not.toMatch(/NOT NULL/i);
    expect(joined).toContain(
      'FOREIGN KEY ("suspendedByUserId") REFERENCES public."user"(id) ON DELETE SET NULL',
    );
    expect(joined).toContain(
      'FOREIGN KEY ("reactivatedByUserId") REFERENCES public."user"(id) ON DELETE SET NULL',
    );
    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM/i);
    expect(joined).not.toMatch(/CREATE INDEX/i);
  });

  it('DOWN removes only the two FKs and three B4.0 columns', async () => {
    const sql = await run('down');
    const joined = sql.join(' ');

    expect(joined).toContain(
      'DROP CONSTRAINT "FK_business_capability_reactivated_by"',
    );
    expect(joined).toContain(
      'DROP CONSTRAINT "FK_business_capability_suspended_by"',
    );
    expect(joined).toContain('DROP COLUMN "reactivatedByUserId"');
    expect(joined).toContain('DROP COLUMN "reactivatedAt"');
    expect(joined).toContain('DROP COLUMN "suspendedByUserId"');
    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM|\bDROP\s+TABLE/i);
  });

  it('the entity exposes nullable scalar fields and SET NULL User relations', () => {
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter(
      ({ target }) => target === BusinessCapability,
    );
    const column = (name: string) =>
      columns.find(({ propertyName }) => propertyName === name);

    expect(column('suspendedByUserId')?.options.nullable).toBe(true);
    expect(column('reactivatedAt')?.options).toMatchObject({
      type: 'timestamp',
      nullable: true,
    });
    expect(column('reactivatedByUserId')?.options.nullable).toBe(true);

    const relations = storage.relations.filter(
      ({ target }) => target === BusinessCapability,
    );
    for (const name of ['suspendedByUser', 'reactivatedByUser']) {
      const relation = relations.find(({ propertyName }) => propertyName === name);
      expect(relation?.options).toMatchObject({
        nullable: true,
        onDelete: 'SET NULL',
      });
      expect(relation?.type()).toBe(User);
    }
  });

  it('raises the repository migration implementation count to 10', () => {
    const migrations = readdirSync(__dirname).filter((name) =>
      /^\d{13}-.+\.ts$/.test(name),
    );
    expect(migrations).toHaveLength(10);
  });
});
