import { BadRequestException } from '@nestjs/common';
import { CodCalculationService } from './cod-calculation.service';

describe('CodCalculationService', () => {
  const service = new CodCalculationService();

  it('requires an upfront percentage for intercity COD', () => {
    const result = service.calculate({ basePrice: 300_000, deliveryFee: 15_000, isIntercity: true });

    expect(result.totalAmount).toBe(315_000);
    expect(result.upfrontPercent).toBe(20);
    expect(result.upfrontRequired).toBe(63_000);
    expect(result.remainingBalance).toBe(252_000);
    expect(result.upfrontRequired + result.remainingBalance).toBe(result.totalAmount);
  });

  it('requires no upfront payment for same-city COD by default', () => {
    const result = service.calculate({ basePrice: 50_000, deliveryFee: 3_000, isIntercity: false });

    expect(result.upfrontPercent).toBe(0);
    expect(result.upfrontRequired).toBe(0);
    expect(result.remainingBalance).toBe(result.totalAmount);
  });

  it('rejects a transaction below the minimum COD value', () => {
    expect(() =>
      service.calculate({ basePrice: 2_000, deliveryFee: 0, isIntercity: true }),
    ).toThrow(BadRequestException);
  });

  it('rejects a transaction above the maximum COD value', () => {
    expect(() =>
      service.calculate({ basePrice: 5_000_000, deliveryFee: 0, isIntercity: true }),
    ).toThrow(BadRequestException);
  });

  it('never lets upfront + remaining drift from the total due to rounding', () => {
    const result = service.calculate({ basePrice: 99_999, deliveryFee: 1, isIntercity: true });
    expect(
      Math.round((result.upfrontRequired + result.remainingBalance) * 100),
    ).toBe(Math.round(result.totalAmount * 100));
  });

  it('assertEligible can be called standalone before presenting COD as an option', () => {
    expect(() => service.assertEligible(5_000)).toThrow(BadRequestException);
    expect(() => service.assertEligible(100_000)).not.toThrow();
  });
});
