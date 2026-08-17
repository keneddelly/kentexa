import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { SearchIndexService } from './search-index.service';

// One-time (idempotent — safe to re-run) catch-up for content that existed
// before semantic search did. New content is indexed automatically going
// forward via each service's create/update hooks — this just backfills
// what predates them. Mirrors CommerceProfilesBackfillService's pattern.
@Injectable()
export class SearchBackfillService {
  private readonly logger = new Logger(SearchBackfillService.name);

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Classified) private classifiedRepo: Repository<Classified>,
    @InjectRepository(ServiceAd) private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
    private searchIndex: SearchIndexService,
  ) {}

  async run(): Promise<{ products: number; classifieds: number; services: number; profiles: number }> {
    const [products, classifieds, services, profiles] = await Promise.all([
      this.productRepo.find(),
      this.classifiedRepo.find(),
      this.serviceAdRepo.find(),
      this.profileRepo.find(),
    ]);

    for (const p of products) {
      await this.searchIndex
        .upsert('product', p.id, [p.name, p.description, p.category].filter(Boolean).join(' \n '))
        .catch(() => {});
    }
    for (const c of classifieds) {
      await this.searchIndex
        .upsert('classified', c.id, [c.title, c.description, c.category, c.location].filter(Boolean).join(' \n '))
        .catch(() => {});
    }
    for (const s of services) {
      await this.searchIndex
        .upsert('service', s.id, [s.title, s.description, s.category, s.coverageCity].filter(Boolean).join(' \n '))
        .catch(() => {});
    }
    for (const pr of profiles) {
      await this.searchIndex
        .upsert('profile', pr.id, [pr.displayName, pr.bio, pr.category, pr.location].filter(Boolean).join(' \n '))
        .catch(() => {});
    }

    const counts = {
      products: products.length,
      classifieds: classifieds.length,
      services: services.length,
      profiles: profiles.length,
    };
    this.logger.log(`Semantic search backfill complete: ${JSON.stringify(counts)}`);
    return counts;
  }
}
