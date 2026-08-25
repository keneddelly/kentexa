import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from './entities/activity-event.entity';
import { ActivityEventService } from './activity-event.service';
import { ActivityController } from './activity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent])],
  controllers: [ActivityController],
  providers: [ActivityEventService],
  exports: [ActivityEventService],
})
export class ActivityModule {}
