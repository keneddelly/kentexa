/**
 * TzSeedLocationProvider — wraps the EXISTING, already-live TzLocationService
 * (backed by seed-tz-locations.ts, confirmed the authoritative source by
 * direct read of tz-location.service.ts's own imports) as the first
 * LocationProvider. Place at:
 * src/location-intelligence/providers/tz-seed-location.provider.ts
 *
 * search() is unchanged from Stage 2A: it reuses TzLocationService.search()'s
 * own ward -> district -> region cascade exactly as-is and only reshapes the
 * results into the provider-neutral LocationCandidate shape.
 *
 * Stage 2D adds two capabilities for a place picker, both on top of new
 * TzLocationService methods so search() keeps serving its old consumers:
 *   - searchPlaces(): DISCOVERY -- all administrative levels, ranked, with a
 *     deterministic leading-token fallback ("Mbezi Mwisho" -> Mbezi + an
 *     explicitly UNVERIFIED remainder "Mwisho"). Fuzzy/partial by design.
 *   - resolve(): EXACT -- a stable id grammar (ward:<id> | district:<id> |
 *     region:<id>), one active row, every value taken from the server's own
 *     seed data. Never falls back to a name search.
 * Every candidate now carries its stable providerPlaceId.
 */
import { Injectable } from '@nestjs/common';
import { TzLocationService } from '../../tz-location/tz-location.service';
import {
  GeoPoint,
  LocationCandidate,
  LocationProvider,
  LocationSearchOptions,
  PlaceSearchResult,
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

/** The only reference grammar tz_seed understands. Anything else is rejected, never guessed at. */
const TZ_PLACE_REF = /^(ward|district|region):([1-9][0-9]{0,8})$/;

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

  /**
   * Discovery. Tries the whole query first; if nothing matches and the query
   * has several words, drops trailing words one at a time until a LEADING
   * part matches. The dropped part is reported as unmatchedText -- it is the
   * user's own text, never verified, and never turned into geography.
   */
  async searchPlaces(query: string, opts?: { limit?: number }): Promise<PlaceSearchResult> {
    const normalized = (query ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return { candidates: [] };
    const tokens = normalized.split(' ');

    for (let count = tokens.length; count >= 1; count--) {
      const text = tokens.slice(0, count).join(' ');
      if (text.length < 2) break;
      const rows: TzSearchResult[] = await this.tzLocation.searchPlaces(text, opts?.limit);
      if (rows.length > 0) {
        const candidates = rows.map((r) => this.toCandidate(r));
        return count === tokens.length
          ? { candidates, match: { quality: 'full', matchedText: text } }
          : {
              candidates,
              match: { quality: 'partial', matchedText: text, unmatchedText: tokens.slice(count).join(' ') },
            };
      }
    }
    return { candidates: [] };
  }

  /** Exact resolution by stable reference; null for anything but one active, well-formed, existing place. */
  async resolve(providerPlaceId: string): Promise<LocationCandidate | null> {
    if (typeof providerPlaceId !== 'string') return null;
    const m = TZ_PLACE_REF.exec(providerPlaceId);
    if (!m) return null;
    const row: TzSearchResult | null = await this.tzLocation.findPlaceById(
      m[1] as 'ward' | 'district' | 'region',
      Number(m[2]),
    );
    return row ? this.toCandidate(row) : null;
  }

  // No reverseGeocode: TzLocationService has no coordinate -> place lookup
  // today (its data is name-indexed, not spatially indexed). Left
  // unimplemented per the interface's own optionality, not stubbed with a
  // fake result.

  private placeId(r: TzSearchResult): string | undefined {
    if (r.type === 'ward' && r.wardId != null) return `ward:${r.wardId}`;
    if (r.type === 'district' && r.districtId != null) return `district:${r.districtId}`;
    if (r.type === 'region' && r.regionId != null) return `region:${r.regionId}`;
    return undefined;
  }

  private toCandidate(r: TzSearchResult): LocationCandidate {
    const point: Partial<GeoPoint> = toValidatedPoint(r.lat, r.lng);
    return {
      displayLabel: r.fullAddress,
      // Validated as a pair -- see toValidatedPoint's own doc comment. Never
      // exposes one coordinate without the other, and never a NaN/
      // out-of-range value; seed data is trusted but not blindly assumed.
      // These are the seeded administrative AREA's centroid, not an address.
      ...point,
      regionId: r.regionId ?? undefined,
      regionName: r.region ?? undefined,
      districtId: r.districtId ?? undefined,
      districtName: r.district ?? undefined,
      wardId: r.type === 'ward' ? r.wardId : undefined,
      wardName: r.type === 'ward' ? r.ward : undefined,
      providerKey: this.key,
      providerPlaceId: this.placeId(r),
      resolutionMethod: 'admin_seed',
      // landmark, confidence: deliberately omitted -- see LocationCandidate's
      // own doc comment for why.
    };
  }
}
