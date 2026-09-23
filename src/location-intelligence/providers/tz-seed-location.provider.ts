/**
 * TzSeedLocationProvider — wraps the EXISTING, already-live TzLocationService
 * (backed by seed-tz-locations.ts, confirmed the authoritative source by
 * direct read of tz-location.service.ts's own imports) as the first
 * LocationProvider. Place at:
 * src/location-intelligence/providers/tz-seed-location.provider.ts
 *
 * Pure adapter: never re-implements or redesigns TzLocationService.search()'s
 * own ward -> district -> region cascade, its ILIKE matching, or its
 * ambiguous-match behavior (returning every match, not just one) -- all of
 * that is reused exactly as-is. This file only reshapes the results into
 * the provider-neutral LocationCandidate shape.
 */
import { Injectable } from '@nestjs/common';
import { TzLocationService } from '../../tz-location/tz-location.service';
import {
  LocationCandidate,
  LocationProvider,
  LocationSearchOptions,
  toValidatedPoint,
} from '../location-provider.interface';

interface TzSearchResult {
  // string, not a narrow union: TzLocationService.search() has no explicit
  // return type, so TypeScript infers the union of its three internal
  // branch shapes with 'type' widened to string -- matched here rather
  // than fighting that inference with a cast.
  type: string;
  wardId?: number;
  ward?: string;
  districtId?: number;
  district?: string;
  regionId?: number;
  region?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  fullAddress: string;
}

@Injectable()
export class TzSeedLocationProvider implements LocationProvider {
  readonly key = 'tz_seed';

  constructor(private readonly tzLocation: TzLocationService) {}

  async search(query: string, opts?: LocationSearchOptions): Promise<LocationCandidate[]> {
    const trimmed = query?.trim();
    if (!trimmed) return [];

    const results: TzSearchResult[] = await this.tzLocation.search(trimmed);
    const limited = opts?.limit ? results.slice(0, opts.limit) : results;
    return limited.map((r) => this.toCandidate(r));
  }

  // No reverseGeocode: TzLocationService has no coordinate -> place lookup
  // today (its data is name-indexed, not spatially indexed). Left
  // unimplemented per the interface's own optionality, not stubbed with a
  // fake result.

  private toCandidate(r: TzSearchResult): LocationCandidate {
    return {
      displayLabel: r.fullAddress,
      // Validated as a pair -- see toValidatedPoint's own doc comment. Never
      // exposes one coordinate without the other, and never a NaN/
      // out-of-range value; seed data is trusted but not blindly assumed.
      ...toValidatedPoint(r.lat, r.lng),
      regionId: r.regionId ?? undefined,
      regionName: r.region ?? undefined,
      districtId: r.districtId ?? undefined,
      districtName: r.district ?? undefined,
      wardId: r.type === 'ward' ? r.wardId : undefined,
      wardName: r.type === 'ward' ? r.ward : undefined,
      providerKey: this.key,
      resolutionMethod: 'admin_seed',
      // landmark, providerPlaceId, confidence: deliberately omitted -- see
      // LocationCandidate's own doc comment for why.
    };
  }
}
