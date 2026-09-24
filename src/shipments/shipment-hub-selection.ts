/**
 * Shipment hub selection (Stage 2F) -- ONE shared candidate/decision policy.
 *
 *   resolved geography -> ELIGIBLE HUB CANDIDATES -> validated hub DECISION
 *
 * Three concepts, kept apart:
 *   discovery  = read-only candidate list (discoverHubCandidates, no lock);
 *   selection  = the durable decision stored on the Shipment (this file's
 *                ShipmentHubSource + decideHubForSide);
 *   custody    = the Parcel's own hub references, owned by the operator
 *                workflows -- NOT decided or rewritten here.
 *
 * Deliberate non-goals (each guarded by a test):
 *  - Hub selection is INDEPENDENT of the legacy pickupOption/deliveryOption
 *    enum. `agent` is not redefined as "hub-mediated"; `door`/`station` never
 *    trigger a hub. A side is hub-mediated ONLY when the sender explicitly
 *    supplies a hub id or explicitly requests hub selection for that side.
 *  - No hub is ever chosen by row order, rating, distance or "first match".
 *    Exactly one eligible hub may be auto-selected (and is recorded as such);
 *    several require an explicit choice.
 *  - Free text has no geography, so it has no hub authority.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { TZ_REGION_CAPITALS } from '../tz-location/region-capitals';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { ShipmentHubSource } from './shipment-hub-source';
import { USER_TYPED_PROVIDER_KEY, USER_TYPED_RESOLUTION_METHOD } from './shipment-location-snapshot';

export { ShipmentHubSource };

export const SHIPMENT_HUB_SOURCES: readonly ShipmentHubSource[] = Object.freeze(
  Object.values(ShipmentHubSource),
);

/** Sources that name a hub (hubId may later become NULL if the hub row is deleted). */
export const HUB_NAMING_SOURCES: readonly ShipmentHubSource[] = Object.freeze([
  ShipmentHubSource.SENDER_SELECTED,
  ShipmentHubSource.AUTO_SINGLE_CANDIDATE,
]);

export type HubSide = 'origin' | 'destination';

export const HUB_SELECTION_REQUIRED = 'HUB_SELECTION_REQUIRED';
export const HUB_DECISION_CONFLICT = 'HUB_DECISION_CONFLICT';

/** Sender-facing hub fields: business name, city, business address. Nothing else. */
export interface HubCandidate {
  hubId: number;
  name: string | null;
  city: string;
  address: string | null;
}

/** What the sender asked for on one side (already validated). */
export interface HubSelectionInput {
  hubId?: number;
  /** true when the sender supplied a hub id OR explicitly requested hub selection. */
  requested: boolean;
}

export interface HubDecision {
  source: ShipmentHubSource;
  hubId: number | null;
}

/** The stored, immutable decision on a Shipment (both sides or neither). */
export interface StoredHubDecision {
  originHubSource?: string | null;
  originHubId?: number | null;
  destinationHubSource?: string | null;
  destinationHubId?: number | null;
}

/** The persisted snapshot facts hub discovery is allowed to look at. */
export interface StoredSideGeography {
  regionName?: string | null;
  providerKey?: string | null;
  resolutionMethod?: string | null;
}

// ── request parsing ─────────────────────────────────────────────────────────

/**
 * Validates one side's hub input. An id must be a positive integer (never a
 * numeric string); `request` must be exactly `true` when present. Anything
 * else is a 400 -- never coerced.
 */
export function parseHubSelectionInput(
  side: HubSide,
  rawHubId: unknown,
  rawRequest: unknown,
): HubSelectionInput {
  let hubId: number | undefined;
  if (rawHubId !== undefined && rawHubId !== null) {
    if (typeof rawHubId !== 'number' || !Number.isSafeInteger(rawHubId) || rawHubId <= 0) {
      throw new BadRequestException(`${side}HubId must be a positive integer`);
    }
    hubId = rawHubId;
  }
  if (rawRequest !== undefined && rawRequest !== null && rawRequest !== true && rawRequest !== false) {
    throw new BadRequestException(`request${side === 'origin' ? 'Origin' : 'Destination'}Hub must be a boolean`);
  }
  return { hubId, requested: hubId !== undefined || rawRequest === true };
}

export function parseHubSide(raw: unknown): HubSide {
  if (raw === 'origin' || raw === 'destination') return raw;
  throw new BadRequestException('side must be "origin" or "destination"');
}

// ── geography -> match keys (server-derived only) ───────────────────────────

/**
 * Compatibility keys for hubs, from a REGION name only: the region itself,
 * plus its capital where the shared production policy (TZ_REGION_CAPITALS)
 * supplies one that differs (SuperAgent.city legitimately holds capitals such
 * as "Moshi"). Trimmed, lower-cased, de-duplicated. The single alias map is
 * reused, never re-declared. A key is a SEARCH key, not a hub identity.
 */
export function hubMatchKeys(regionName: string | null | undefined): string[] {
  if (typeof regionName !== 'string') return [];
  const region = regionName.trim();
  if (!region) return [];
  const keys: string[] = [];
  for (const raw of [region, TZ_REGION_CAPITALS[region]]) {
    if (typeof raw !== 'string') continue;
    const k = raw.trim().toLowerCase();
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

/**
 * Keys for a side already stored on a Shipment. Only a side the SERVER
 * resolved counts: free text (provider 'user' / method 'user_typed'), legacy
 * rows with no provenance and rows with no region have NO hub authority
 * (returns null). Nothing here reads client input.
 */
export function storedSideHubKeys(side: StoredSideGeography): string[] | null {
  const provider = typeof side.providerKey === 'string' ? side.providerKey.trim() : '';
  if (!provider || provider === USER_TYPED_PROVIDER_KEY) return null;
  if (side.resolutionMethod === USER_TYPED_RESOLUTION_METHOD) return null;
  const keys = hubMatchKeys(side.regionName);
  return keys.length ? keys : null;
}

// ── candidate discovery (the ONE query) ─────────────────────────────────────

/**
 * Eligible hubs for a set of match keys: status ACTIVE (today's only
 * eligibility rule) and normalised-exact city equality (trim + case-fold; no
 * LIKE, no substring, no user pattern). Stable `id ASC` -- an order for
 * determinism, NOT a recommendation. Projects only the sender-safe fields.
 *
 * `lockRows` = true (only inside a transaction) takes `FOR SHARE` on the
 * returned rows, so a concurrent suspension either commits first (the hub is
 * then not returned) or waits until this transaction commits. Unlocked reads
 * are advisory (discovery); the decision path always locks.
 */
export async function discoverHubCandidates(
  repo: Repository<SuperAgent>,
  keys: string[] | null,
  lockRows: boolean,
): Promise<HubCandidate[]> {
  if (!keys || keys.length === 0) return [];
  const qb = repo
    .createQueryBuilder('hub')
    .select(['hub.id', 'hub.businessName', 'hub.city', 'hub.address'])
    .where('hub.status = :active', { active: SuperAgentStatus.ACTIVE })
    .andWhere('LOWER(BTRIM(hub.city)) IN (:...keys)', { keys })
    .orderBy('hub.id', 'ASC');
  if (lockRows) qb.setLock('pessimistic_read');
  const rows = await qb.getMany();
  return rows.map((h) => ({
    hubId: h.id,
    name: h.businessName ?? null,
    city: h.city,
    address: h.address ?? null,
  }));
}

/** Convenience for transaction code. */
export function hubRepoOf(em: EntityManager): Repository<SuperAgent> {
  return em.getRepository(SuperAgent);
}

// ── the decision (pure) ─────────────────────────────────────────────────────

/**
 * The 0/1/many table for ONE side. `keys` is null when the side is not a
 * server-resolved place. `candidates` must have been read under lock.
 *   not requested            -> NOT_REQUIRED (no hub, no lookup)
 *   explicit id              -> must be in `candidates`, else 400; SENDER_SELECTED
 *   requested, 0 candidates  -> NONE_AVAILABLE
 *   requested, 1 candidate   -> AUTO_SINGLE_CANDIDATE
 *   requested, many          -> 409 HUB_SELECTION_REQUIRED (never an arbitrary pick)
 */
export function decideHubForSide(
  side: HubSide,
  input: HubSelectionInput,
  keys: string[] | null,
  candidates: HubCandidate[],
): HubDecision {
  if (!input.requested) return { source: ShipmentHubSource.NOT_REQUIRED, hubId: null };

  if (input.hubId !== undefined) {
    if (!keys) {
      throw new BadRequestException(
        `The ${side} location is not a resolved place, so a hub cannot be selected for it`,
      );
    }
    if (!candidates.some((c) => c.hubId === input.hubId)) {
      throw new BadRequestException(`Hub ${input.hubId} is not an eligible ${side} hub for this location`);
    }
    return { source: ShipmentHubSource.SENDER_SELECTED, hubId: input.hubId };
  }

  if (candidates.length === 0) return { source: ShipmentHubSource.NONE_AVAILABLE, hubId: null };
  if (candidates.length === 1) {
    return { source: ShipmentHubSource.AUTO_SINGLE_CANDIDATE, hubId: candidates[0].hubId };
  }
  throw new ConflictException({
    statusCode: 409,
    code: HUB_SELECTION_REQUIRED,
    message: `Several hubs can serve the ${side} location; choose one`,
    side,
    candidates,
  });
}

// ── retry / idempotency (pure) ──────────────────────────────────────────────

/**
 * Does a (retry) request disagree with the decision already stored? A stored
 * decision always wins; a request that would need a DIFFERENT one is a 409 and
 * is never applied. Omitting hub input is always compatible.
 */
export function conflictsWithStoredDecision(
  input: HubSelectionInput,
  storedSource: string | null | undefined,
  storedHubId: number | null | undefined,
): boolean {
  if (!input.requested) return false;
  if (input.hubId !== undefined) return (storedHubId ?? null) !== input.hubId;
  return storedSource === ShipmentHubSource.NOT_REQUIRED;
}

export function decisionConflictError(side: HubSide): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: HUB_DECISION_CONFLICT,
    message: `The ${side} hub decision for this shipment is already recorded and cannot be changed`,
    side,
  });
}

export function assertNoDecisionConflict(
  stored: StoredHubDecision,
  inputs: Record<HubSide, HubSelectionInput>,
): void {
  if (conflictsWithStoredDecision(inputs.origin, stored.originHubSource, stored.originHubId)) {
    throw decisionConflictError('origin');
  }
  if (conflictsWithStoredDecision(inputs.destination, stored.destinationHubSource, stored.destinationHubId)) {
    throw decisionConflictError('destination');
  }
}

export function anyHubRequested(inputs: Record<HubSide, HubSelectionInput>): boolean {
  return inputs.origin.requested || inputs.destination.requested;
}

export const NO_HUB_INPUT: Record<HubSide, HubSelectionInput> = Object.freeze({
  origin: Object.freeze({ requested: false }),
  destination: Object.freeze({ requested: false }),
}) as Record<HubSide, HubSelectionInput>;
