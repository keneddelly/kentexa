import { DEFAULT_FEE_SETTINGS, feeSettingsFrom, jobFee, owedState, ruleFor } from './kentexa-fee-calc';

describe('Ada ya KenteXa numbers (owner approved 2026-11-03)', () => {
  const s = DEFAULT_FEE_SETTINGS;

  it('ofisi: 10% of the shipping fee, min 200, cap 5,000', () => {
    const r = ruleFor('office', s);
    expect(jobFee(15000, r.rate, r.min, r.cap)).toBe(1500);
    expect(jobFee(1500, r.rate, r.min, r.cap)).toBe(200);
    expect(jobFee(300000, r.rate, r.min, r.cap)).toBe(5000);
  });

  it('agent: 10% of the delivery fee, min 100', () => {
    const r = ruleFor('agent', s);
    expect(jobFee(3000, r.rate, r.min, r.cap)).toBe(300);
    expect(jobFee(800, r.rate, r.min, r.cap)).toBe(100);
  });

  it('seller: 2% of the product price, no minimum or cap', () => {
    const r = ruleFor('seller', s);
    expect(jobFee(1_240_000, r.rate, r.min, r.cap)).toBe(24800);
    expect(jobFee(1000, r.rate, r.min, r.cap)).toBe(20);
  });

  it('a job that earned nothing pays nothing, and the fee never exceeds what was earned', () => {
    expect(jobFee(0, 10, 200, 5000)).toBe(0);
    expect(jobFee(-5, 10, 200, 5000)).toBe(0);
    expect(jobFee(150, 10, 200, 5000)).toBe(150);
  });

  it('settings: stored values win, bad values keep the default', () => {
    const got = feeSettingsFrom([{ key: 'office_rate', value: '8' }, { key: 'agent_min', value: 'x' }, { key: 'start_at', value: '2026-11-03T06:00:00Z' }]);
    expect(got.officeRate).toBe(8);
    expect(got.agentMin).toBe(100);
    expect(got.officeFree).toBe(20);
    expect(got.startAt.toISOString()).toBe('2026-11-03T06:00:00.000Z');
  });

  it('owed: payments pay the oldest first; arrears only when something older than 30 days is unpaid', () => {
    const now = new Date('2026-12-20T00:00:00Z');
    const start = new Date('2026-11-03T00:00:00Z');
    const fees = [{ fee: 1000, doneAt: '2026-11-05T00:00:00Z' }, { fee: 2000, doneAt: '2026-12-15T00:00:00Z' }];
    expect(owedState(fees, 0, 0, start, 30, now)).toEqual({ owed: 3000, inArrears: true });
    expect(owedState(fees, 1000, 0, start, 30, now)).toEqual({ owed: 2000, inArrears: false });
    expect(owedState(fees, 1000, 4000, start, 30, now)).toEqual({ owed: 6000, inArrears: true });
    expect(owedState([], 0, 0, start, 30, now)).toEqual({ owed: 0, inArrears: false });
  });
});
