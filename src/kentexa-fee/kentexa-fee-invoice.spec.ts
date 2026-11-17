import { finishedMonths, invoiceNumber, invoiceStatuses, monthLabel } from './kentexa-fee-calc';

describe('Ada ya KenteXa monthly ankara (owner approved 2026-11-17)', () => {
  const start = new Date('2026-11-03T00:00:00Z');

  it('lists only finished months, in Dar time', () => {
    expect(finishedMonths(start, new Date('2026-11-17T10:00:00Z'))).toEqual([]);
    // 30 Nov 22:00 UTC is already 1 Dec in Dar: November is finished.
    expect(finishedMonths(start, new Date('2026-11-30T22:00:00Z'))).toEqual(['2026-11-01']);
    expect(finishedMonths(start, new Date('2027-02-10T00:00:00Z'))).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('numbers and month names', () => {
    expect(invoiceNumber('office', 12, '2026-11-01')).toBe('KX-202611-O0012');
    expect(invoiceNumber('seller', 34567, '2027-01-01')).toBe('KX-202701-S34567');
    expect(monthLabel('2026-11-01')).toBe('Novemba 2026');
  });

  it('payments pay the old debt, then the oldest invoice first', () => {
    const now = new Date('2027-01-20T00:00:00Z');
    const inv = [
      { id: 2, periodStart: '2026-12-01', amount: '3000', dueAt: '2027-01-31' },
      { id: 1, periodStart: '2026-11-01', amount: '2000', dueAt: '2026-12-31' },
    ];
    const none = invoiceStatuses(inv, 0, 0, now);
    expect(none.map((i) => [i.id, i.status, i.late])).toEqual([[1, 'unpaid', true], [2, 'unpaid', false]]);
    const some = invoiceStatuses(inv, 3500, 1000, now);
    expect(some.map((i) => [i.id, i.status, i.paid, i.left])).toEqual([[1, 'paid', 2000, 0], [2, 'part', 500, 2500]]);
    expect(invoiceStatuses(inv, 9000, 0, now).every((i) => i.status === 'paid' && !i.late)).toBe(true);
    expect(invoiceStatuses(inv, 500, 1000, now)[0].status).toBe('unpaid');
  });
});
