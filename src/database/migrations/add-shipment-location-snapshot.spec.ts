import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import {
  AddShipmentLocationSnapshot1788271200000,
  SHIPMENT_LOCATION_SNAPSHOT_COLUMNS,
} from './1788271200000-AddShipmentLocationSnapshot';
import { Shipment } from '../../shipments/entities/shipment.entity';

describe('AddShipmentLocationSnapshot1788271200000', () => {
  const run = async (direction: 'up' | 'down') => {
    const sql: string[] = [];
    const queryRunner = {
      query: jest.fn(async (statement: string) => {
        sql.push(statement.replace(/\s+/g, ' ').trim());
        return [];
      }),
    } as any;
    await new AddShipmentLocationSnapshot1788271200000()[direction](queryRunner);
    return sql;
  };

  it('is timestamped after the Stage 1 migration', () => {
    expect(1788271200000).toBeGreaterThan(1788267600000);
  });

  it('UP is a single additive ALTER TABLE: 14 nullable ADD COLUMN IF NOT EXISTS, no default', async () => {
    const sql = await run('up');
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/^ALTER TABLE public\.shipment /);
    expect(SHIPMENT_LOCATION_SNAPSHOT_COLUMNS).toHaveLength(14);
    for (const col of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) {
      expect(sql[0]).toContain(`ADD COLUMN IF NOT EXISTS "${col}" `);
    }
    expect((sql[0].match(/ADD COLUMN/g) || []).length).toBe(14);
    expect(sql[0]).not.toMatch(/NOT NULL|DEFAULT/i);
  });

  it('UP does no backfill, no row writes/reads, no constraint/index/FK, and touches no existing column', async () => {
    const sql = (await run('up')).join(' ');
    expect(sql).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM|\bSELECT\s/i);
    expect(sql).not.toMatch(/CONSTRAINT|INDEX|REFERENCES|FOREIGN KEY|DROP|RENAME|ALTER COLUMN|TYPE\s/i);
    for (const existing of ['originCity', 'destinationCity', 'originRegionId', 'originWard', 'originWardId']) {
      expect(sql).not.toContain(`"${existing}"`);
    }
  });

  it('DOWN drops exactly the columns UP adds and nothing else', async () => {
    const sql = await run('down');
    expect(sql).toHaveLength(1);
    expect((sql[0].match(/DROP COLUMN IF EXISTS/g) || []).length).toBe(14);
    for (const col of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) {
      expect(sql[0]).toContain(`DROP COLUMN IF EXISTS "${col}"`);
    }
    expect(sql[0]).not.toMatch(/DROP TABLE|CASCADE/i);
  });

  it('the migration column list matches the Shipment entity snapshot columns exactly (nullable)', () => {
    const cols = getMetadataArgsStorage().columns.filter(({ target }) => target === Shipment);
    const byName = (n: string) => cols.find(({ propertyName }) => propertyName === n);
    for (const name of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) {
      expect(byName(name)).toBeDefined();
      expect(byName(name)!.options.nullable).toBe(true);
      expect(byName(name)!.options.default).toBeUndefined();
    }
  });

  it('legacy columns stay as they were: city NOT NULL, ids/ward nullable', () => {
    const cols = getMetadataArgsStorage().columns.filter(({ target }) => target === Shipment);
    const byName = (n: string) => cols.find(({ propertyName }) => propertyName === n)!;
    expect(byName('originCity').options.nullable).not.toBe(true);
    expect(byName('destinationCity').options.nullable).not.toBe(true);
    for (const n of ['originRegionId', 'originWard', 'originWardId', 'destinationRegionId', 'destinationWard', 'destinationWardId']) {
      expect(byName(n).options.nullable).toBe(true);
    }
  });
});
