import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduledJobsCheck } from './scheduled-jobs.check';

// Read-only start-up check of the timed jobs (see scheduled-jobs.check.ts).
// SchedulerRegistry comes from AppModule's single, global ScheduleModule.forRoot().
@Module({
  imports: [DiscoveryModule],
  providers: [ScheduledJobsCheck],
})
export class SchedulingCheckModule {}
