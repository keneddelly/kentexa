import { Injectable } from '@nestjs/common';
import { LocationCandidate, LocationProvider, LocationSearchOptions, PlaceSearchResult, toValidatedPoint } from '../location-provider.interface';

@Injectable()
export class GooglePlacesLocationProvider implements LocationProvider {
  readonly key = 'google_places';
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  async search(query: string, opts?: LocationSearchOptions): Promise<LocationCandidate[]> {
    return (await this.searchPlaces(query, { limit: opts?.limit })).candidates;
  }
  async searchPlaces(query: string, opts?: { limit?: number }): Promise<PlaceSearchResult> {
    if (!this.apiKey || query.trim().length < 3) return { candidates: [] };
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' },
      body: JSON.stringify({ input: query.trim(), includedRegionCodes: ['tz'], languageCode: 'sw' }),
    });
    if (!response.ok) return { candidates: [] };
    const data: any = await response.json();
    const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 10);
    return { candidates: (data.suggestions ?? []).flatMap((s: any) => {
      const p = s.placePrediction;
      return p?.placeId && p?.text?.text ? [{ displayLabel: p.text.text, providerKey: this.key, providerPlaceId: p.placeId, resolutionMethod: 'google_places_autocomplete' } as LocationCandidate] : [];
    }).slice(0, limit) };
  }
  async resolve(providerPlaceId: string): Promise<LocationCandidate | null> {
    if (!this.apiKey || !providerPlaceId) return null;
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId)}?languageCode=sw&regionCode=TZ`, {
      headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' },
    });
    if (!response.ok) return null;
    const p: any = await response.json();
    const components = Array.isArray(p.addressComponents) ? p.addressComponents : [];
    const nameFor = (...types: string[]) => { const c = components.find((x: any) => types.some(t => x.types?.includes(t))); return c?.longText || c?.shortText; };
    return {
      displayLabel: p.formattedAddress || p.displayName?.text || providerPlaceId,
      ...toValidatedPoint(p.location?.latitude, p.location?.longitude),
      regionName: nameFor('administrative_area_level_1'),
      districtName: nameFor('administrative_area_level_2', 'administrative_area_level_3'),
      wardName: nameFor('sublocality_level_1', 'sublocality', 'neighborhood'),
      landmark: p.displayName?.text,
      providerKey: this.key, providerPlaceId: p.id || providerPlaceId, resolutionMethod: 'google_places_details',
    };
  }
}
