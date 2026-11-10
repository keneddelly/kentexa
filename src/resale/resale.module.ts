import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResaleController } from './resale.controller';
import { ResaleService } from './resale.service';
import { ResaleNudgeService } from './resale-nudge.service';
import { ResaleWeeklyService } from './resale-weekly.service';

// Raw SQL on product and resale_offer only (DataSource): no dependency on other feature modules.
@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [ResaleController],
  providers: [ResaleService, ResaleNudgeService, ResaleWeeklyService],
})
export class ResaleModule {}
