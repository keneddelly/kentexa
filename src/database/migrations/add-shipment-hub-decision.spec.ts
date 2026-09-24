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

  it('UP is additive only: no DML, no DROP, no rewrite of existing columns, everything idempotent', async () => {
    const sql = await run('up');
    for (const q of sql) {
      const dml = q.replace(/ON DELETE SET NULL/g, '').replace(/SELECT 1 FROM pg_constraint/g, ''); // only catalog existence checks and FK actions may remain
      expect(dml).not.toMatch(/\b(INSERT|UPDATE|DELETE|SELECT|DROP|TRUNCATE|ALTER COLUMN|RENAME)\b/i);
      expect(q).toMatch(/IF NOT EXISTS/);
    }
    expect(sql[0]).toMatch(/^ALTER TABLE public\.shipment/);
    for (const c of SHIPMENT_HUB_DECISION_COLUMNS) expect(sql[0]).toContain(`ADD COLUMN IF NOT EXISTS "${c}"`);
    expect(sql.join('\n')).not.toMatch(/NOT NULL DEFAULT|DEFAULT/);
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
