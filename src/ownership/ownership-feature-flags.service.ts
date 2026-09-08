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
 */
export type OwnershipFeatureFlag =
  | 'PRODUCT_WORKSPACE_DUAL_WRITE'
  | 'PRODUCT_WORKSPACE_READ'
  | 'CLASSIFIED_WORKSPACE_DUAL_WRITE'
  | 'CLASSIFIED_WORKSPACE_READ';

const DEFAULTS: Record<OwnershipFeatureFlag, boolean> = {
  PRODUCT_WORKSPACE_DUAL_WRITE: true,
  PRODUCT_WORKSPACE_READ: false,
  CLASSIFIED_WORKSPACE_DUAL_WRITE: true,
  CLASSIFIED_WORKSPACE_READ: false,
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
