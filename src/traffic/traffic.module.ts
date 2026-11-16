import { Body, BadRequestException, Controller, Get, Global, Module, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ActivityModule } from '../activity/activity.module';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { SpikeModeService, spikeMode } from './spike-mode.service';

/** Traffic step 2 (issue #368): the admin's emergency switch. Every change is recorded. */
@Controller('traffic')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SpikeModeController {
  constructor(private readonly spike: SpikeModeService, private readonly events: ActivityEventService) {}

  @Get('spike-mode')
  status() {
    return this.spike.status();
  }

  @Post('spike-mode')
  set(@Body('on') on: any, @Request() req: any) {
    if (typeof on !== 'boolean') throw new BadRequestException('Chagua kuwasha au kuzima.');
    const out = this.spike.set(on, req?.user?.id ?? null);
    this.events.record({
      eventType: 'SPIKE_MODE_CHANGED', category: ActivityCategory.SYSTEM, actorId: req?.user?.id ?? null,
      actorType: 'user', targetType: 'system', metadata: { on }, visibility: 'system', severity: 'notice',
    })?.catch?.(() => {});
    return out;
  }
}

@Global()
@Module({
  imports: [ActivityModule],
  controllers: [SpikeModeController],
  providers: [{ provide: SpikeModeService, useValue: spikeMode }],
  exports: [SpikeModeService],
})
export class TrafficModule {}
