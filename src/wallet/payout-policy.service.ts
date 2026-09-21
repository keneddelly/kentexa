import { Injectable } from '@nestjs/common';

/**
 * Payout-destination policy, read from configuration -- never a code constant.
 * If the cooling-off is not explicitly configured (unset, empty, negative or
 * non-numeric) the policy is UNAVAILABLE and a Business payout destination can
 * NOT be activated (fail closed). An explicit `0` is a valid policy value.
 */
@Injectable()
export class PayoutPolicyService {
  /** Seconds a newly verified destination must wait before it is usable, or null when policy is not configured. */
  coolingOffSeconds(): number | null {
    const raw = process.env.PAYOUT_DESTINATION_COOLING_OFF_SECONDS;
    if (raw === undefined || raw.trim() === '') return null;
    if (!/^\d+$/.test(raw.trim())) return null;
    const n = parseInt(raw.trim(), 10);
    return Number.isSafeInteger(n) ? n : null;
  }
}
