import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { SearchIndexService } from './search-index.service';
import { SearchBackfillService } from './search-backfill.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';

// The AI "front door" — one endpoint the frontend's unified search bar hits
// before it knows which domain (product/classified/service/transport) to
// route to.
@Controller('search')
export class SearchController {
  constructor(
    private aiSearchParser: AiSearchParserService,
    private aiSearchExplainer: AiSearchExplainerService,
    private searchIndex: SearchIndexService,
    private searchBackfill: SearchBackfillService,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Classified) private classifiedRepo: Repository<Classified>,
    @InjectRepository(ServiceAd) private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
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

  // Meaning-based search — catches matches keyword search structurally
  // cannot (a query in one language/wording against content in another,
  // or content whose relevant text lives in a profile's bio rather than a
  // listing's own title/description). Always additive on the frontend,
  // never a replacement for the keyword search built earlier — fails open
  // to [] on any error (extension unavailable, no API key, etc.).
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('semantic')
  async semantic(@Query('q') q: string): Promise<any[]> {
    if (!q?.trim()) return [];
    try {
      const matches = await this.searchIndex.similaritySearch(q.trim());
      if (!matches.length) return [];

      const idsByType: Record<string, number[]> = {};
      for (const m of matches) {
        (idsByType[m.entityType] ||= []).push(m.entityId);
      }
      const scoreOf = new Map(
        matches.map((m) => [`${m.entityType}:${m.entityId}`, m.score]),
      );

      const [products, classifieds, services, profiles] = await Promise.all([
        idsByType.product?.length
          ? this.productRepo.find({ where: { id: In(idsByType.product) } })
          : [],
        idsByType.classified?.length
          ? this.classifiedRepo.find({ where: { id: In(idsByType.classified) } })
          : [],
        idsByType.service?.length
          ? this.serviceAdRepo.find({ where: { id: In(idsByType.service) } })
          : [],
        idsByType.profile?.length
          ? this.profileRepo.find({ where: { id: In(idsByType.profile) } })
          : [],
      ]);

      return [
        ...products.map((p) => ({ ...p, _type: 'product', _score: scoreOf.get(`product:${p.id}`) })),
        ...classifieds.map((c) => ({ ...c, _type: 'classified', _score: scoreOf.get(`classified:${c.id}`) })),
        ...services.map((s) => ({ ...s, _type: 'service', _score: scoreOf.get(`service:${s.id}`) })),
        ...profiles.map((pr) => ({ ...pr, _type: 'profile', _score: scoreOf.get(`profile:${pr.id}`) })),
      ].sort((a, b) => (b._score || 0) - (a._score || 0));
    } catch {
      return [];
    }
  }

  // Admin-only, idempotent — catches up content that existed before
  // semantic search did. Safe to re-run.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/backfill-embeddings')
  runEmbeddingBackfill() {
    return this.searchBackfill.run();
  }
}
