import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActionRecorderInterceptor } from './action-recorder.interceptor';
import { AdminMirrorService } from './admin-mirror.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from './entities/activity-event.entity';
import { ActivityEventService } from './activity-event.service';
import { ActivityController } from './activity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent])],
  controllers: [ActivityController],
  // Every change made on KenteXa is recorded for the admin (owner 2026-11-09).
  providers: [ActivityEventService, AdminMirrorService, { provide: APP_INTERCEPTOR, useClass: ActionRecorderInterceptor }],
  exports: [ActivityEventService],
})
export class ActivityModule {}
