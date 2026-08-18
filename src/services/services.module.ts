/**
 * ServicesModule
 * Place at: src/services/services.module.ts
 * Register in: src/app.module.ts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceAd } from './entities/service-ad.entity';
import { JobRequest } from './entities/job-request.entity';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { FeedModule } from '../feed/feed.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { SearchModule } from '../search/search.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceAd, JobRequest]),
    FeedModule,
    CommerceProfilesModule,
    SearchModule,
    AiModule,
  ],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
