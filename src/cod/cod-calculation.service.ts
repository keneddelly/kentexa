import { Injectable, BadRequestException } from '@nestjs/common';
import {
  INTERCITY_UPFRONT_PERCENT,
  SAME_CITY_UPFRONT_PERCENT,
  MIN_COD_ORDER_VALUE,
  MAX_COD_ORDER_VALUE,
} from './cod-policy.config';

export interface CodCalculationInput {
  basePrice: number;
  deliveryFee: number;
  isIntercity: boolean;
}

export interface CodCalculationResult {
  totalAmount: number;
  upfrontRequired: number;
  remainingBalance: number;
  upfrontPercent: number;
}

// The ONE place that decides a COD transaction's payment schedule —
// online order, manual sale, and classified invoice all call this instead
// of each computing (and potentially disagreeing on) their own upfront
// split. It deliberately does NOT compute commission — every entry point
// already has its own, separately-evolved commission logic (see the audit
// in plans/mutable-meandering-dongarra.md for why those 4 sites weren't
// unified here) — this only decides how much of the already-known total
// is due now vs. on delivery.
@Injectable()
export class CodCalculationService {
  // Throws if the transaction isn't eligible for COD at all (too small,
  // too large) — callers should catch this before ever presenting COD as
  // an option, not just before charging the upfront amount.
  assertEligible(totalAmount: number): void {
    if (totalAmount < MIN_COD_ORDER_VALUE) {
      throw new BadRequestException(
        `COD is not available for orders under TZS ${MIN_COD_ORDER_VALUE.toLocaleString()}`,
      );
    }
    if (totalAmount > MAX_COD_ORDER_VALUE) {
      throw new BadRequestException(
        `COD is not available for orders over TZS ${MAX_COD_ORDER_VALUE.toLocaleString()}`,
      );
    }
  }

  calculate(input: CodCalculationInput): CodCalculationResult {
    const totalAmount = Number(input.basePrice || 0) + Number(input.deliveryFee || 0);
    this.assertEligible(totalAmount);

    const upfrontPercent = input.isIntercity
      ? INTERCITY_UPFRONT_PERCENT
      : SAME_CITY_UPFRONT_PERCENT;

    const upfrontRequired = parseFloat(((totalAmount * upfrontPercent) / 100).toFixed(2));
    const remainingBalance = parseFloat((totalAmount - upfrontRequired).toFixed(2));

    return { totalAmount, upfrontRequired, remainingBalance, upfrontPercent };
  }
}
