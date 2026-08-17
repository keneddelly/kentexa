import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AiSearchParserService,
  ParsedSearchQuery,
} from '../ai/ai-search-parser.service';
import {
  AiSearchExplainerService,
  ExplainedSearch,
  SearchResultSummary,
} from '../ai/ai-search-explainer.service';

// The AI "front door" — one endpoint the frontend's unified search bar hits
// before it knows which domain (product/classified/service/transport) to
// route to.
@Controller('search')
export class SearchController {
  constructor(
    private aiSearchParser: AiSearchParserService,
    private aiSearchExplainer: AiSearchExplainerService,
  ) {}

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

  // The conversational half of search — called AFTER the frontend has
  // already fetched real results, so it can talk about what was actually
  // found instead of just routing to it. Fails open to an empty response
  // (no banner shown) rather than an error, same as getIntent() above —
  // this is a "nice to have" layer on top of search, never load-bearing.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('explain')
  async explain(
    @Body() body: { q: string; resultSummary: SearchResultSummary },
  ): Promise<ExplainedSearch> {
    if (!body?.q?.trim() || !body.resultSummary) {
      return { summary: '', suggestions: [] };
    }
    try {
      return await this.aiSearchExplainer.explain(
        body.q.trim(),
        body.resultSummary,
      );
    } catch {
      return { summary: '', suggestions: [] };
    }
  }
}
