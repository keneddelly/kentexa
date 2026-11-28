import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ServerErrorFilter } from './server-error.filter';
import { ActionRecorderInterceptor } from './action-recorder.interceptor';
import { AdminMirrorService } from './admin-mirror.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from './entities/activity-event.entity';
import { ActivityEventService } from './activity-event.service';
import { ActivityController } from './activity.controller';
import { ClientErrorsController } from './client-errors.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent])],
  controllers: [ActivityController, ClientErrorsController],
  // Every change made on KenteXa is recorded for the admin (owner 2026-11-09).
  providers: [ActivityEventService, AdminMirrorService, { provide: APP_INTERCEPTOR, useClass: ActionRecorderInterceptor },
    // Error Watch: 5xx responses are recorded for the admin; the response itself is unchanged.
    { provide: APP_FILTER, useClass: ServerErrorFilter }],
  exports: [ActivityEventService],
})
export class ActivityModule {}
