import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AiSearchParserService,
  ParsedSearchQuery,
} from '../ai/ai-search-parser.service';

// The AI "front door" — one endpoint the frontend's unified search bar hits
// before it knows which domain (product/classified/service/transport) to
// route to.
@Controller('search')
export class SearchController {
  constructor(private aiSearchParser: AiSearchParserService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('intent')
  async getIntent(@Query('q') q: string): Promise<ParsedSearchQuery> {
    if (!q?.trim()) {
      return {
        domain: 'all',
        keywords: '',
        category: null,
        minPrice: null,
        maxPrice: null,
        fromCity: null,
        toCity: null,
      };
    }
    try {
      return await this.aiSearchParser.parse(q.trim());
    } catch {
      // AI unavailable/errored — fail open with an unfiltered "all" intent
      // so the frontend can still fall back to its own plain search.
      return {
        domain: 'all',
        keywords: q.trim(),
        category: null,
        minPrice: null,
        maxPrice: null,
        fromCity: null,
        toCity: null,
      };
    }
  }
}
