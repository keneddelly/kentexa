import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPromptTemplateService } from './ai-prompt-templates.service';
import { TzLocationService } from '../tz-location/tz-location.service';
import { parsePriceExpression } from './price-expression-parser.util';

export type SearchDomain =
  | 'product'
  | 'classified'
  | 'service'
  | 'transport'
  | 'people'
  | 'all';

export interface ParsedSearchQuery {
  domain: SearchDomain;
  keywords: string;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  fromCity?: string | null;
  toCity?: string | null;
  // Generic place name for product/classified/service queries — distinct
  // from fromCity/toCity, which stay transport-route-specific. "kinasa
  // sauti Mwanza" / "spy camera Keko" populate this, not fromCity/toCity.
  location?: string | null;
}

// Shared by ProductsModule and ClassifiedsModule — has no feature-specific
// repo dependencies, so it lives in AiModule rather than duplicating it.
@Injectable()
export class AiSearchParserService {
  constructor(
    private aiService: AiService,
    private prompts: AiPromptTemplateService,
    private tzLocation: TzLocationService,
  ) {}

  async parse(query: string): Promise<ParsedSearchQuery> {
    // Deterministic baseline — regex price parsing + a location-name
    // lookup against the real Tanzania location hierarchy. Computed first
    // so price/location filtering keeps working even when the AI call
    // below fails, is unconfigured, or simply misses the shorthand — the
    // AI result only overrides a field here when it actually returned a
    // non-null value for it, never the other way around.
    const [deterministicPrice, deterministicLocation] = await Promise.all([
      Promise.resolve(parsePriceExpression(query)),
      this.extractLocationFallback(query),
    ]);

    // The AI call is allowed to fail here (no provider configured, network
    // error, etc.) without losing the deterministic price/location signal
    // — callers of parse() (search.controller.ts's /search/intent, and the
    // opt-in ai=true paths on products/classifieds) previously caught a
    // thrown error and fell back to a bare {domain:'all', keywords:q}
    // intent with NO price/location at all. Catching internally means
    // "AI down" degrades to "keyword + deterministic price/location
    // search", not "keyword search with zero structure."
    let ai: ParsedSearchQuery = { domain: 'all', keywords: query };
    try {
      const template = this.prompts.searchParsePrompt();
      const result = await this.aiService.generate<ParsedSearchQuery>({
        task: 'search-parse',
        prompt: query,
        system: template.system,
        schema: template.schema,
        schemaName: template.schemaName,
        cacheKey: `search-parse:${query.trim().toLowerCase()}`,
      });
      ai = result.data;
    } catch {
      // Fall through with the {domain:'all', keywords:query} default above.
    }

    return {
      ...ai,
      minPrice: ai.minPrice ?? deterministicPrice.minPrice,
      maxPrice: ai.maxPrice ?? deterministicPrice.maxPrice,
      location: ai.location ?? deterministicLocation,
    };
  }

  // Best-effort — checks the query's trailing 1-3 words against the real
  // ward/district/region table (TzLocationService.search(), reused as-is)
  // for a confident match. Only accepts a hit when the candidate text
  // equals the matched place's name (or its first word, so "Dar" still
  // resolves to "Dar es Salaam") — a loose substring match would false-
  // positive on ordinary words that happen to appear inside some ward
  // name. Never throws; a lookup failure just means no location signal,
  // same fail-open posture as the AI call itself.
  private async extractLocationFallback(query: string): Promise<string | null> {
    const words = query.trim().split(/\s+/).filter(Boolean);
    for (const windowSize of [3, 2, 1]) {
      if (words.length < windowSize) continue;
      const candidate = words.slice(words.length - windowSize).join(' ');
      if (candidate.replace(/[^a-zA-Z]/g, '').length < 3) continue;
      try {
        const results = await this.tzLocation.search(candidate);
        if (!results?.length) continue;
        const top = results[0] as any;
        const name: string = top.ward || top.district || top.region || '';
        if (!name) continue;
        const nameFirstWord = name.toLowerCase().split(/\s+/)[0];
        const candidateLower = candidate.toLowerCase();
        if (nameFirstWord === candidateLower || name.toLowerCase() === candidateLower) {
          return name;
        }
      } catch {
        // Location lookup is best-effort only — never blocks search.
      }
    }
    return null;
  }
}
