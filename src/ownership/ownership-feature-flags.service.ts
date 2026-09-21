import { Injectable } from '@nestjs/common';

/**
 * Business-First Stage 2A rollout flags -- deliberately its own service,
 * separate from CommunicationFeatureFlagsService, so ownership-migration
 * rollout state and Stage 2 communication rollout state can never be
 * conflated or accidentally cross-gated. Same discipline as that service:
 * independent per-entity dual-write/read pairs (never one giant switch),
 * env-var driven, every flag defaults to the conservative launch posture
 * (writes on, scoped reads off). Product and Classified are independently
 * controlled and independently reversible -- activating/rolling back one
 * must never affect the other.
 *
 * I2G adds the commerce-money partition flags. Defaults are conservative:
 * server-side workspace stamping and the fail-closed release guard are ON
 * (they only ever prevent misattribution); read/mutation ENFORCEMENT and every
 * Business payout capability are OFF until explicitly enabled per stage.
 */
export type OwnershipFeatureFlag =
  | 'PRODUCT_WORKSPACE_DUAL_WRITE'
  | 'PRODUCT_WORKSPACE_READ'
  | 'CLASSIFIED_WORKSPACE_DUAL_WRITE'
  | 'CLASSIFIED_WORKSPACE_READ'
  // I2G
  | 'ORDER_WORKSPACE_STAMP'
  | 'RELEASE_GUARD_ENFORCE'
  | 'SALE_WORKSPACE_ENFORCE'
  | 'ORDER_WORKSPACE_ENFORCE'
  | 'BUSINESS_PAYOUT_DESTINATION_ENABLED'
  | 'BUSINESS_WITHDRAWAL_ENABLED';

const DEFAULTS: Record<OwnershipFeatureFlag, boolean> = {
  PRODUCT_WORKSPACE_DUAL_WRITE: true,
  PRODUCT_WORKSPACE_READ: false,
  CLASSIFIED_WORKSPACE_DUAL_WRITE: true,
  CLASSIFIED_WORKSPACE_READ: false,
  ORDER_WORKSPACE_STAMP: true,
  RELEASE_GUARD_ENFORCE: true,
  SALE_WORKSPACE_ENFORCE: false,
  ORDER_WORKSPACE_ENFORCE: false,
  BUSINESS_PAYOUT_DESTINATION_ENABLED: false,
  BUSINESS_WITHDRAWAL_ENABLED: false,
};

@Injectable()
export class OwnershipFeatureFlagsService {
  isEnabled(flag: OwnershipFeatureFlag): boolean {
    const envKey = `OWNERSHIP_FLAG_${flag}`;
    const raw = process.env[envKey];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULTS[flag];
  }
}
