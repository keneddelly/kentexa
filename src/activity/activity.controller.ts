import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityEventService } from './activity-event.service';
import { ActivityCategory } from './entities/activity-event.entity';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// Admin-only for now — just enough to verify Phase 1's event bus is
// actually recording real activity. The business-facing "Today's Kentexa
// Intelligence" report and admin dashboard (Layers 2-4) are later phases.
// `?category=AI` doubles this as the AI audit-trail viewer (Phase 7) —
// no separate endpoint needed since AI_EVENT rows are ordinary
// ActivityEvents tagged category: AI, visibility: 'system'.
@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ActivityController {
  constructor(private readonly activityEvents: ActivityEventService) {}

  @Get('admin/recent')
  getRecent(@Query('limit') limit: string, @Query('category') category?: string) {
    const validCategory = Object.values(ActivityCategory).includes(
      category as ActivityCategory,
    )
      ? (category as ActivityCategory)
      : undefined;
    return this.activityEvents.findRecent(Number(limit) || 50, validCategory);
  }
}
