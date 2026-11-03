import { readFileSync } from 'fs';
import { join } from 'path';
import { officesInArrears, paidUpFirst, paidUpGateSql, setFeeStandingReady } from './paid-up-gate';

// Ada ya KenteXa (owner approved 2026-11-03).
describe('Ada ya KenteXa: SQL safety and paid-up first', () => {
  it('casts every query parameter in the fee service (inconsistent-type errors stopped a live deploy before)', () => {
    const src = readFileSync(join(__dirname, 'kentexa-fee.service.ts'), 'utf8');
    const params = src.match(/\$\d+(::[a-z\[\]]+)?/g) || [];
    expect(params.length).toBeGreaterThan(10);
    expect(params.filter((p) => !p.includes('::'))).toEqual([]);
  });

  it('the migration creates the tables, the settings and clears old seller-shipment debt with a record', () => {
    const src = readFileSync(join(__dirname, '../database/migrations/1794600000000-AddKentexaFee.ts'), 'utf8');
    for (const t of ['kentexa_fee_setting', 'kentexa_fee ', 'kentexa_fee_payment', 'kentexa_fee_standing', 'kentexa_fee_reminder', 'kentexa_fee_cleared']) {
      expect(src).toContain(`public.${t}`);
    }
    expect(src).toContain("('office_free', '20')");
    expect(src).toContain("('agent_free', '20')");
    expect(src).toContain("('market_rate', '2')");
    expect(src).toContain("('lipa_number', '10473656887')");
    expect(src).toContain('UQ_kentexa_fee_source');
  });

  it('before the migration the agent gate is open; after, an agent in arrears waits the first minutes', () => {
    setFeeStandingReady(false);
    expect(paidUpGateSql('a."userId"')).toBe('TRUE');
    setFeeStandingReady(true, 10);
    const sql = paidUpGateSql('a."userId"');
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain('kentexa_fee_standing');
    setFeeStandingReady(true, 0);
    expect(paidUpGateSql('a."userId"')).toBe('TRUE');
    setFeeStandingReady(false);
  });

  it('offices: paid-up first, each group keeps its own (cheapest-first) order, nobody is dropped', async () => {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(paidUpFirst(list, (x) => x.id, new Set([1, 3])).map((x) => x.id)).toEqual([2, 4, 1, 3]);
    expect(paidUpFirst(list, (x) => x.id, new Set()).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    setFeeStandingReady(false);
    expect([...(await officesInArrears({ query: async () => [{ accountId: 9 }] }, [9]))]).toEqual([]);
    setFeeStandingReady(true, 10);
    expect([...(await officesInArrears({ query: async () => [{ accountId: 9 }] }, [9]))]).toEqual([9]);
    setFeeStandingReady(false);
  });
});
