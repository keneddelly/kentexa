import { drawer, saleByMethod, saleCash, sumByMethod } from './pos-day';

// POS part 2 (owner approved 2026-11-03): Leo and Funga zamu.
describe('POS day and drawer', () => {
  const cash = { total: 10000, paymentMethod: 'cash', amountPaid: 20000, changeDue: 10000, balanceDue: 0, payments: null };
  const split = { total: 50000, paymentMethod: 'mpesa', amountPaid: 50000, changeDue: 0, balanceDue: 0, payments: [{ method: 'cash', amount: 20000 }, { method: 'mpesa', amount: 30000 }] };
  const credit = { total: 12000, paymentMethod: 'cash', amountPaid: 4000, changeDue: 0, balanceDue: 8000, payments: [{ method: 'cash', amount: 4000 }] };

  it('cash in the drawer is what was paid in cash minus the change', () => {
    expect(saleCash(cash)).toBe(10000);
    expect(saleCash(split)).toBe(20000);
    expect(saleByMethod(credit)).toEqual({ cash: 4000, deni: 8000 });
  });

  it('the day by payment method', () => {
    expect(sumByMethod([cash, split, credit])).toEqual({ cash: 34000, mpesa: 30000, deni: 8000 });
  });

  it('the drawer: start + cash sales + debts paid in cash - expenses, and the difference', () => {
    expect(drawer(50000, 210000, 8000, 15000, 252000)).toEqual({ expected: 253000, difference: -1000 });
    expect(drawer(0, 0, 0, 0)).toEqual({ expected: 0, difference: null });
  });
});
