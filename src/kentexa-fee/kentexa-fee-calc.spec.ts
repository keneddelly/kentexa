import { DEFAULT_FEE_SETTINGS, feeSettingsFrom, jobFee, lockState, owedState, ruleFor } from './kentexa-fee-calc';

describe('Ada ya KenteXa numbers (owner approved 2026-11-03)', () => {
  const s = DEFAULT_FEE_SETTINGS;

  it('ofisi: TZS 500 per parcel, never more than the parcel earned (owner 2026-11-17)', () => {
    const r = ruleFor('office', s);
    expect(jobFee(15000, r.rate, r.min, r.cap)).toBe(500);
    expect(jobFee(1500, r.rate, r.min, r.cap)).toBe(500);
    expect(jobFee(300000, r.rate, r.min, r.cap)).toBe(500);
    expect(jobFee(300, r.rate, r.min, r.cap)).toBe(300);
    expect(jobFee(0, r.rate, r.min, r.cap)).toBe(0);
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

describe('Ada ya KenteXa: kufungwa at TZS 50,000 and 30 days (owner 2026-11-17)', () => {
  const s = { startAt: new Date('2026-11-03T00:00:00Z'), arrearsDays: 30, lockAmount: 50000, lockWarnDays: 3 };
  const fees = (n: number, at: string) => Array.from({ length: n }, () => ({ fee: 500, doneAt: at }));

  it('locks only when the debt is 50,000 or more AND part of it is older than 30 days', () => {
    const now = new Date('2026-12-20T00:00:00Z');
    expect(lockState(fees(100, '2026-11-05T00:00:00Z'), 0, 0, s, now)).toMatchObject({ owed: 50000, locked: true });
    expect(lockState(fees(99, '2026-11-05T00:00:00Z'), 0, 0, s, now).locked).toBe(false); // 49,500
    expect(lockState(fees(100, '2026-12-10T00:00:00Z'), 0, 0, s, now).locked).toBe(false); // recent work only
    expect(lockState(fees(100, '2026-11-05T00:00:00Z'), 500, 0, s, now).locked).toBe(false); // paid below 50,000
  });

  it('warns 3 days before the lock, once the debt is big enough', () => {
    const now = new Date('2026-12-03T00:00:00Z'); // the 5 Nov fees turn 30 days old on 5 Dec
    expect(lockState(fees(100, '2026-11-05T00:00:00Z'), 0, 0, s, now)).toMatchObject({ locked: false, warn: true });
    expect(lockState(fees(100, '2026-11-05T00:00:00Z'), 0, 0, s, new Date('2026-11-25T00:00:00Z')).warn).toBe(false);
    expect(lockState(fees(100, '2026-11-05T00:00:00Z'), 0, 0, { ...s, lockAmount: 0 }, now)).toMatchObject({ locked: false, warn: false });
  });
});
