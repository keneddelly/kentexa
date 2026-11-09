import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AdminMirrorService } from './admin-mirror.service';
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
  constructor(
    private readonly activityEvents: ActivityEventService,
    private readonly mirror: AdminMirrorService,
  ) {}

  // Owner 2026-11-09: "admin is the mirror of KenteXa". Every recorded action, newest first.
  @Get('admin/feed')
  feed(
    @Query('category') category?: string, @Query('eventType') eventType?: string,
    @Query('actorId') actorId?: string, @Query('businessId') businessId?: string,
    @Query('kind') kind?: string, @Query('before') before?: string, @Query('limit') limit?: string, @Query('q') q?: string,
  ) {
    const id = (v?: string) => (Number(v) > 0 ? Math.floor(Number(v)) : undefined);
    return this.mirror.feed({
      category, eventType, actorId: id(actorId), businessId: id(businessId),
      kind: kind === 'named' || kind === 'action' ? kind : 'all', before: id(before), limit: id(limit), q,
    });
  }

  // Everything about one person, on one page.
  @Get('admin/people/:userId')
  person(@Param('userId', ParseIntPipe) userId: number) {
    return this.mirror.person(userId);
  }

  // Everything about one business, on one page.
  @Get('admin/businesses/:businessId')
  business(@Param('businessId', ParseIntPipe) businessId: number) {
    return this.mirror.business(businessId);
  }

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
