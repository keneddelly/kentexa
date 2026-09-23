/**
 * Place discovery endpoint (Stage 2D).
 *
 * PUBLIC on purpose: it exposes only public administrative geography (the
 * same data GET /locations/regions|districts|wards|search already serve
 * unauthenticated). It is DISCOVERY, not authority -- a result is a
 * suggestion the client can select by its placeRef; the server re-resolves
 * that reference exactly when it is used (LocationIntelligenceService.resolve),
 * so nothing in this response can be forged into trusted data later.
 *
 * Deliberately leaks nothing beyond the reference contract: no coordinates, no
 * internal ids, no provider confidence -- only what a person needs to tell
 * candidates apart plus the stable placeRef.
 */
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LocationIntelligenceService } from './location-intelligence.service';
import { LocationCandidate, PlaceSearchMatch } from './location-provider.interface';

export const PLACE_SEARCH_MIN_QUERY = 2;
export const PLACE_SEARCH_MAX_QUERY = 80;
export const PLACE_SEARCH_MAX_LIMIT = 10;
export const PLACE_SEARCH_DEFAULT_LIMIT = 8;

export interface PublicPlaceCandidate {
  placeRef: { providerKey: string; providerPlaceId: string };
  displayLabel: string;
  level: 'ward' | 'district' | 'region';
  regionName?: string;
  districtName?: string;
  wardName?: string;
}

export interface PublicPlaceSearchResponse {
  query: string;
  candidates: PublicPlaceCandidate[];
  /** Present when candidates exist. `partial` = only the leading words matched; unmatchedText is unverified user text. */
  match?: PlaceSearchMatch;
}

function toPublicCandidate(c: LocationCandidate): PublicPlaceCandidate | null {
  // A candidate without a stable reference cannot be selected later, so it is not offered.
  if (!c.providerPlaceId) return null;
  return {
    placeRef: { providerKey: c.providerKey, providerPlaceId: c.providerPlaceId },
    displayLabel: c.displayLabel,
    level: c.wardName ? 'ward' : c.districtName ? 'district' : 'region',
    regionName: c.regionName,
    districtName: c.districtName,
    wardName: c.wardName,
  };
}

@Controller('location-intelligence')
export class LocationIntelligenceController {
  constructor(private readonly locationIntelligence: LocationIntelligenceService) {}

  @Get('places')
  // Tighter than the global 100/min default: this is an autocomplete-style
  // public endpoint that runs three LIKE queries per call.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async searchPlaces(
    @Query('q') q?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<PublicPlaceSearchResponse> {
    if (typeof q !== 'string') throw new BadRequestException('q is required');
    const query = q.replace(/\s+/g, ' ').trim();
    if (query.length < PLACE_SEARCH_MIN_QUERY || query.length > PLACE_SEARCH_MAX_QUERY) {
      throw new BadRequestException(
        `q must be ${PLACE_SEARCH_MIN_QUERY}-${PLACE_SEARCH_MAX_QUERY} characters`,
      );
    }

    let limit = PLACE_SEARCH_DEFAULT_LIMIT;
    if (limitRaw !== undefined) {
      if (typeof limitRaw !== 'string' || !/^[0-9]{1,3}$/.test(limitRaw) || Number(limitRaw) < 1) {
        throw new BadRequestException('limit must be a positive integer');
      }
      limit = Math.min(Number(limitRaw), PLACE_SEARCH_MAX_LIMIT); // capped, not rejected
    }

    const result = await this.locationIntelligence.searchPlaces(query, { limit });
    const candidates = result.candidates
      .map(toPublicCandidate)
      .filter((c): c is PublicPlaceCandidate => c !== null);
    return candidates.length > 0 ? { query, candidates, match: result.match } : { query, candidates: [] };
  }
}
