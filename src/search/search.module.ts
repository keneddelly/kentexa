import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from '../ai/ai.module';
import { SearchController } from './search.controller';
import { VectorSchemaService } from './vector-schema.service';
import { SearchIndexService } from './search-index.service';
import { SearchBackfillService } from './search-backfill.service';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([Product, Classified, ServiceAd, CommerceProfile]),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
  ],
  controllers: [SearchController],
  providers: [VectorSchemaService, SearchIndexService, SearchBackfillService],
  exports: [SearchIndexService],
})
export class SearchModule {}
