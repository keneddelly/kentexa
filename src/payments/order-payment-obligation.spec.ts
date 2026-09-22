import { deriveOrderPaymentObligation } from './order-payment-obligation';
import { OrderPaymentMethod } from '../orders/entities/order.entity';

describe('deriveOrderPaymentObligation', () => {
  it('ONLINE order: obligation is the full totalAmount', () => {
    const o = deriveOrderPaymentObligation({ paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 198000, codUpfrontAmount: null });
    expect(o).toEqual({ purpose: 'ORDER_FULL', requiredMinor: 19800000 });
  });

  it('COD order with a deposit: obligation is the deposit, NEVER the full total (Decision — TZS 36,000 example)', () => {
    const o = deriveOrderPaymentObligation({ paymentMethod: OrderPaymentMethod.COD, totalAmount: 198000, codUpfrontAmount: 36000 });
    expect(o).toEqual({ purpose: 'COD_DEPOSIT', requiredMinor: 3600000 });
    expect(o.requiredMinor).not.toBe(19800000);
  });

  it('COD order with zero upfront: purpose is COD_DEPOSIT with requiredMinor 0 (caller decides fail-closed policy)', () => {
    const o = deriveOrderPaymentObligation({ paymentMethod: OrderPaymentMethod.COD, totalAmount: 60000, codUpfrontAmount: 0 });
    expect(o).toEqual({ purpose: 'COD_DEPOSIT', requiredMinor: 0 });
  });

  it('COD order with a null codUpfrontAmount treats the requirement as 0, not the full total', () => {
    const o = deriveOrderPaymentObligation({ paymentMethod: OrderPaymentMethod.COD, totalAmount: 60000, codUpfrontAmount: null });
    expect(o).toEqual({ purpose: 'COD_DEPOSIT', requiredMinor: 0 });
  });

  it('handles decimal-string DB amounts safely', () => {
    const o = deriveOrderPaymentObligation({ paymentMethod: 'online', totalAmount: '180000.00', codUpfrontAmount: null });
    expect(o.requiredMinor).toBe(18000000);
  });
});
