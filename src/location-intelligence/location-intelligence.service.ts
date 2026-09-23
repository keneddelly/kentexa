/**
 * LocationIntelligenceService — the ONE canonical service boundary through
 * which future Shipment, checkout, business-address, and logistics
 * consumers resolve/search locations. Place at:
 * src/location-intelligence/location-intelligence.service.ts
 *
 * Stage 2A deliberately does not persist anything here. No Place entity, no
 * migration, no consumer wiring beyond this module's own tests. Persistence
 * is deferred until a real consumer (the Shipment/address snapshot work)
 * proves the exact storage contract it actually needs -- inventing one now
 * would be speculative schema, not architecture.
 *
 * Depends only on the LocationProvider contract, never on a provider's own
 * internal shape -- callers never see a TzLocationService result or any
 * future external-provider DTO directly.
 */
import { Injectable } from '@nestjs/common';
import {
  LocationCandidate,
  LocationProvider,
  LocationSearchOptions,
  PlaceRef,
  PlaceSearchResult,
} from './location-provider.interface';
import { TzSeedLocationProvider } from './providers/tz-seed-location.provider';

@Injectable()
export class LocationIntelligenceService {
  // Ordered: the first provider with a non-empty result wins. Only one
  // provider exists in this stage; the ordering exists so a future external
  // provider can be added (e.g. appended after tz_seed, or prepended ahead
  // of it) without any interface or consumer change.
  private readonly providers: LocationProvider[];

  constructor(tzSeedProvider: TzSeedLocationProvider) {
    this.providers = [tzSeedProvider];
  }

  /**
   * Never throws for "nothing found" -- returns [] explicitly, which is
   * this design's own definition of "fail clearly": a well-typed, always-
   * present empty result the caller can branch on directly, rather than an
   * ambiguous null/undefined or a generic swallowed exception. A genuinely
   * unexpected provider error (a real bug, a thrown exception from the
   * underlying TzLocationService) propagates unmodified -- this method
   * never wraps or hides a real failure as an empty result.
   *
   * Ambiguous/duplicate names are never collapsed: every matching
   * candidate from the winning provider is returned, each carrying enough
   * of its own context (region/district/ward) for a caller to distinguish
   * them.
   */
  async search(query: string, opts?: LocationSearchOptions): Promise<LocationCandidate[]> {
    const trimmed = query?.trim();
    if (!trimmed) return [];

    for (const provider of this.providers) {
      const results = await provider.search(trimmed, opts);
      if (results.length > 0) return results;
    }
    return [];
  }

  /**
   * Discovery for a place picker (Stage 2D): the first provider that
   * supports searchPlaces() and has candidates wins. Candidates carry a stable
   * placeRef basis (providerKey + providerPlaceId). Fuzzy/partial by design --
   * a search result is a SUGGESTION, never authority; only resolve() is.
   */
  async searchPlaces(query: string, opts?: { limit?: number }): Promise<PlaceSearchResult> {
    const trimmed = query?.trim();
    if (!trimmed) return { candidates: [] };
    for (const provider of this.providers) {
      if (!provider.searchPlaces) continue;
      const result = await provider.searchPlaces(trimmed, opts);
      if (result.candidates.length > 0) return result;
    }
    return { candidates: [] };
  }

  /**
   * EXACT resolution of a reference a client selected (Stage 2D). The
   * provider is chosen strictly by `providerKey` (no provider guessing, no
   * fallback to other providers or to a name search); a key that matches no
   * provider, a provider without resolve(), or any malformed/unknown/inactive
   * id all yield null. Every field of the returned candidate comes from the
   * provider's own data -- the caller never contributes facts.
   */
  async resolve(ref: PlaceRef): Promise<LocationCandidate | null> {
    if (!ref || typeof ref.providerKey !== 'string' || typeof ref.providerPlaceId !== 'string') return null;
    const provider = this.providers.find((p) => p.key === ref.providerKey);
    if (!provider?.resolve) return null;
    return provider.resolve(ref.providerPlaceId);
  }
}
