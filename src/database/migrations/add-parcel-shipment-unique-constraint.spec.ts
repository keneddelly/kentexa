import 'reflect-metadata';
import { readdirSync } from 'fs';
import { AddParcelShipmentUniqueConstraint1788267600000 } from './1788267600000-AddParcelShipmentUniqueConstraint';

describe('AddParcelShipmentUniqueConstraint1788267600000', () => {
  const makeQueryRunner = (duplicateRows: Array<{ shipmentId: number; n: number }>) => {
    const sql: string[] = [];
    const queryRunner = {
      query: jest.fn(async (statement: string) => {
        sql.push(statement.replace(/\s+/g, ' ').trim());
        if (/GROUP BY "shipmentId"/.test(statement)) {
          return duplicateRows;
        }
        return [];
      }),
    } as any;
    return { queryRunner, sql };
  };

  it('UP fails closed and creates nothing when a duplicate shipmentId already exists', async () => {
    const { queryRunner, sql } = makeQueryRunner([{ shipmentId: 42, n: 2 }]);
    const migration = new AddParcelShipmentUniqueConstraint1788267600000();

    await expect(migration.up(queryRunner)).rejects.toThrow(/shipmentId=42/);
    await expect(migration.up(queryRunner)).rejects.toThrow(/refusing to add the unique index/);

    // The duplicate-check SELECT ran, but no CREATE UNIQUE INDEX was ever issued.
    expect(sql.some((s) => /GROUP BY "shipmentId"/.test(s))).toBe(true);
    expect(sql.some((s) => /CREATE UNIQUE INDEX/i.test(s))).toBe(false);
    // Never touches historical rows.
    expect(sql.join(' ')).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM/i);
  });

  it('UP adds a nullable (partial) unique index when there are no duplicates', async () => {
    const { queryRunner, sql } = makeQueryRunner([]);
    const migration = new AddParcelShipmentUniqueConstraint1788267600000();

    await migration.up(queryRunner);

    const joined = sql.join(' ');
    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_parcel_shipmentId" ON public.parcel ("shipmentId") WHERE "shipmentId" IS NOT NULL',
    );
    // Never touches the existing FK, never backfills, never drops/recreates the table.
    expect(joined).not.toMatch(/DROP TABLE|ALTER TABLE public\.parcel DROP CONSTRAINT/i);
    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM/i);
  });

  it('DOWN drops only the unique index, nothing else', async () => {
    const { queryRunner, sql } = makeQueryRunner([]);
    const migration = new AddParcelShipmentUniqueConstraint1788267600000();

    await migration.down(queryRunner);

    expect(sql).toEqual(['DROP INDEX IF EXISTS "UQ_parcel_shipmentId"']);
  });

  it('is present among the repository migration implementations', () => {
    const migrations = readdirSync(__dirname).filter((name) =>
      /^\d{13}-.+\.ts$/.test(name),
    );
    expect(migrations).toContain('1788267600000-AddParcelShipmentUniqueConstraint.ts');
  });
});
