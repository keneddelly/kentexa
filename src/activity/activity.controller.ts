import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityEventService } from './activity-event.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// Admin-only for now — just enough to verify Phase 1's event bus is
// actually recording real activity. The business-facing "Today's Kentexa
// Intelligence" report and admin dashboard (Layers 2-4) are later phases.
@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ActivityController {
  constructor(private readonly activityEvents: ActivityEventService) {}

  @Get('admin/recent')
  getRecent(@Query('limit') limit: string) {
    return this.activityEvents.findRecent(Number(limit) || 50);
  }
}
