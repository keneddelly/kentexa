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
import { BusinessFeedItem } from '../business/entities/business-feed-item.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';

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
    @InjectRepository(BusinessFeedItem) private momentRepo: Repository<BusinessFeedItem>,
    @InjectRepository(TransportRoute) private routeRepo: Repository<TransportRoute>,
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

  private intentResult(entityType: string, row: any, score?: number) {
    const id = Number(row.id);
    const base: any = { ...row, _type: entityType, _score: score, intentRef: { entityType, entityId: id } };
    switch (entityType) {
      case 'product':
        return { ...base, intentRef: { ...base.intentRef, destination: `ProductDetail-${id}`, actions: ['view', 'message', 'buy'] } };
      case 'classified':
        return { ...base, intentRef: { ...base.intentRef, destination: `ClassifiedDetail-${id}`, actions: ['view', 'message'] } };
      case 'service':
        return { ...base, intentRef: { ...base.intentRef, destination: `ServiceDetail-${id}`, actions: ['view', 'message', 'request_service'] } };
      case 'profile':
        return { ...base, intentRef: { ...base.intentRef, destination: `CommerceProfile-${row.ownerId}`, commerceProfileId: id, actions: ['view', 'follow', 'message'] } };
      case 'moment':
        return { ...base, intentRef: { ...base.intentRef, destination: 'Home', actions: ['view', 'save', 'comment', 'share'] } };
      case 'transport_route':
        return { ...base, intentRef: { ...base.intentRef, destination: 'Search', actions: ['view', 'send_shipment'] } };
      default:
        return base;
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

      const [products, classifieds, services, profiles, moments, transportRoutes] = await Promise.all([
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
        idsByType.moment?.length
          ? this.momentRepo.find({ where: { id: In(idsByType.moment), isActive: true } })
          : [],
        idsByType.transport_route?.length
          ? this.routeRepo.find({ where: { id: In(idsByType.transport_route), isActive: true } })
          : [],
      ]);

      return [
        ...products.map((p) => this.intentResult('product', p, scoreOf.get(`product:${p.id}`))),
        ...classifieds.map((c) => this.intentResult('classified', c, scoreOf.get(`classified:${c.id}`))),
        ...services.map((svc) => this.intentResult('service', svc, scoreOf.get(`service:${svc.id}`))),
        ...profiles.map((pr) => this.intentResult('profile', pr, scoreOf.get(`profile:${pr.id}`))),
        ...moments.map((m) => this.intentResult('moment', m, scoreOf.get(`moment:${m.id}`))),
        ...transportRoutes.map((route) => this.intentResult('transport_route', route, scoreOf.get(`transport_route:${route.id}`))),
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
