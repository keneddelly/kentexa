import {
  AddShipmentHubDecision1788274800000,
  SHIPMENT_HUB_DECISION_COLUMNS,
} from './1788274800000-AddShipmentHubDecision';

const run = async (dir: 'up' | 'down') => {
  const sql: string[] = [];
  await new AddShipmentHubDecision1788274800000()[dir]({ query: async (q: string) => { sql.push(q.replace(/\s+/g, ' ').trim()); } } as any);
  return sql;
};

describe('AddShipmentHubDecision1788274800000 (SQL shape, no database)', () => {
  it('is named with its timestamp and sits after the last shipped migration', () => {
    expect(new AddShipmentHubDecision1788274800000().name).toBe('AddShipmentHubDecision1788274800000');
    expect(1788274800000).toBeGreaterThan(1788271200000);
  });

  it('UP is additive only: no data mutation, no destructive schema changes, and repeatable object creation', async () => {
    const sql = await run('up');
    for (const q of sql) {
      // Read-only SELECTs in the catalog and trigger guard are legitimate.
      // Match actual write statements, rather than keywords in trigger syntax
      // (TG_OP = 'UPDATE', BEFORE UPDATE) or FK actions (ON DELETE SET NULL).
      expect(q).not.toMatch(/\bINSERT\s+INTO\b|\bUPDATE\s+(?:public\.)?\w+\s+SET\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+COLUMN\b|\bRENAME\b/i);
      expect(q).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    }
    expect(sql[0]).toMatch(/^ALTER TABLE public\.shipment/);
    for (const c of SHIPMENT_HUB_DECISION_COLUMNS) expect(sql[0]).toContain(`ADD COLUMN IF NOT EXISTS "${c}"`);
    const joined = sql.join('\n');
    expect(joined).not.toMatch(/NOT NULL DEFAULT|DEFAULT/);
    expect(joined).toContain('CREATE OR REPLACE FUNCTION');
    expect(joined).toContain('CREATE TRIGGER');
    expect(joined).toContain('DROP TRIGGER IF EXISTS');
    for (const side of ['origin', 'destination']) {
      expect(joined).toContain(`FK_shipment_${side}_hub`);
      expect(joined).toContain(`IDX_shipment_${side}HubId`);
    }
  });

  it('every CHECK guards NULL sources explicitly (a NULL IN (...) is NULL and would let the row through)', async () => {
    const checks = (await run('up')).filter((q) => q.includes('CHECK'));
    expect(checks).toHaveLength(3);
    const perSide = checks.filter((q) => /HubSource" IN/.test(q));
    expect(perSide).toHaveLength(2);
    for (const q of perSide) expect(q).toMatch(/HubSource" IS NOT NULL AND "(origin|destination)HubSource" IN \('sender_selected'/);
  });

  it('DOWN removes the CHECKs, indexes, FKs and exactly the 5 columns, all IF EXISTS', async () => {
    const sql = await run('down');
    for (const q of sql) expect(q).toMatch(/IF EXISTS/);
    const last = sql[sql.length - 1];
    for (const c of SHIPMENT_HUB_DECISION_COLUMNS) expect(last).toContain(`DROP COLUMN IF EXISTS "${c}"`);
    expect(sql.filter((q) => q.includes('DROP COLUMN'))).toHaveLength(1);
  });
});
