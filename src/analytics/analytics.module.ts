import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsSession } from './analytics-session.entity';
import { AnalyticsEvent } from './analytics-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsSession, AnalyticsEvent])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
