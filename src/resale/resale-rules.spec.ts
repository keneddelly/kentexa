import { BadRequestException } from '@nestjs/common';
import { assertResaleTerms, assertSellingPrice, profitState, resaleForOrder, resellerProfit, sellingFloor } from './resale-rules';

/** "Uza tena" (owner 2026-11-09): supplier 42,000, reseller sells at 55,000, earns 13,000 a piece. */
describe('Uza tena: price rules', () => {
  it('the floor is the supplier price, or the supplier floor when higher', () => {
    expect(sellingFloor({ resalePrice: '42000.00', resaleMinPrice: null })).toBe(42000);
    expect(sellingFloor({ resalePrice: 42000, resaleMinPrice: 48000 })).toBe(48000);
  });

  it('profit is (selling - supplier) x quantity', () => {
    expect(resellerProfit(55000, 42000, 2)).toBe(26000);
    expect(resellerProfit('55000.00', '42000.00', undefined)).toBe(13000);
  });

  it('a reseller cannot sell below the floor', () => {
    expect(assertSellingPrice(55000, { resalePrice: 42000 })).toBe(55000);
    expect(() => assertSellingPrice(40000, { resalePrice: 42000 })).toThrow(BadRequestException);
    expect(() => assertSellingPrice(45000, { resalePrice: 42000, resaleMinPrice: 48000 })).toThrow('48,000');
    expect(() => assertSellingPrice(0, { resalePrice: 42000 })).toThrow(BadRequestException);
  });

  it('supplier terms: open needs a price, below the shop price; the floor not below it', () => {
    expect(() => assertResaleTerms({ resaleOpen: true, resalePrice: 42000 }, 50000)).not.toThrow();
    expect(() => assertResaleTerms({ resaleOpen: true, resalePrice: null }, 50000)).toThrow(BadRequestException);
    expect(() => assertResaleTerms({ resaleOpen: true, resalePrice: 52000 }, 50000)).toThrow(BadRequestException);
    expect(() => assertResaleTerms({ resaleOpen: true, resalePrice: 42000, resaleMinPrice: 40000 }, 50000)).toThrow(BadRequestException);
    expect(() => assertResaleTerms({ resaleOpen: false, resalePrice: null }, 50000)).not.toThrow();
  });
});

describe('Uza tena: the order is checked again on the server', () => {
  const offer = (over: any = {}) => ({
    id: 7, productId: 3, resellerUserId: 20, price: '55000.00', isActive: true,
    resaleOpen: true, resalePrice: '42000.00', resaleMinPrice: null, sellerId: 9, ...over,
  });
  const q = (row: any) => jest.fn(async () => (row ? [row] : []));

  it('no offer: a normal order, nothing read', async () => {
    const query = q(offer());
    expect(await resaleForOrder(query, undefined, 3, 1)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('a good offer gives the reseller and the amounts from the saved offer', async () => {
    await expect(resaleForOrder(q(offer()), 7, 3, 1)).resolves.toEqual({
      resaleOfferId: 7, resellerUserId: 20, resaleUnitPrice: 55000, supplierUnitPrice: 42000,
    });
  });

  it('refuses: closed offer, other product, product no longer open, own offer, price under a new floor', async () => {
    await expect(resaleForOrder(q(offer({ isActive: false })), 7, 3, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(resaleForOrder(q(offer()), 7, 4, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(resaleForOrder(q(offer({ resaleOpen: false })), 7, 3, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(resaleForOrder(q(offer()), 7, 3, 20)).rejects.toThrow('ofa yako mwenyewe');
    await expect(resaleForOrder(q(offer({ resalePrice: '56000.00' })), 7, 3, 1)).rejects.toThrow('imebadilika');
    await expect(resaleForOrder(q(null), 7, 3, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(resaleForOrder(q(offer()), 'x', 3, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Uza tena R3: where a profit stands', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const days = (n: number) => new Date(now - n * 24 * 3600_000).toISOString();
  it('nothing owed before delivery or on a cancelled order', () => {
    expect(profitState({ status: 'preparing' }, now)).toBe('waiting');
    expect(profitState({ status: 'cancelled', resellerPaidAt: null }, now)).toBe('cancelled');
    expect(profitState({ status: 'disputed' }, now)).toBe('on_hold');
  });
  it('owed after delivery, late after 3 days; then paid, confirmed or disputed', () => {
    expect(profitState({ status: 'delivered', deliveredAt: days(1) }, now)).toBe('owed');
    expect(profitState({ status: 'completed', deliveredAt: days(4) }, now)).toBe('late');
    expect(profitState({ status: 'delivered', deliveredAt: days(4), resellerPaidAt: days(0) }, now)).toBe('paid');
    expect(profitState({ status: 'delivered', resellerPaidAt: days(0), resellerDisputedAt: days(0) }, now)).toBe('disputed');
    expect(profitState({ status: 'delivered', resellerPaidAt: days(1), resellerConfirmedAt: days(0) }, now)).toBe('confirmed');
  });
  it('a supplier with a profit unpaid 7 days gets no new resale orders', async () => {
    const row = { id: 7, productId: 3, resellerUserId: 20, price: '55000.00', isActive: true, resaleOpen: true,
      resalePrice: '42000.00', resaleMinPrice: null, sellerId: 9, unpaidLate: '1' };
    await expect(resaleForOrder(jest.fn(async () => [row]), 7, 3, 1)).rejects.toThrow('halijawalipa');
  });
});
