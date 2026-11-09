import { Controller, Get, Param, ParseIntPipe, Query, Request, UseGuards } from '@nestjs/common';
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

  // Inbox chats between users (owner 2026-11-09: admin reads all chats). Finance cannot open them
  // (auth/staff-access.ts). Opening one chat is recorded with who opened it.
  @Get('admin/chats')
  chats(@Query('q') q?: string, @Query('userId') userId?: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const id = (v?: string) => (Number(v) > 0 ? Math.floor(Number(v)) : undefined);
    return this.mirror.chats({ q, userId: id(userId), before: id(before), limit: id(limit) });
  }

  @Get('admin/chats/:conversationId')
  async chat(@Param('conversationId', ParseIntPipe) conversationId: number, @Request() req) {
    const result = await this.mirror.chat(conversationId);
    await this.activityEvents.record({
      eventType: 'ADMIN_CHAT_VIEWED', category: ActivityCategory.SECURITY, actorId: req.user?.id ?? null, actorType: 'staff',
      targetType: 'conversation', targetId: conversationId, relatedUserId: result.conversation.sellerId ?? null,
      metadata: { customerUserId: result.conversation.customerUserId ?? null, role: req.roleContext?.roleType ?? null },
      severity: 'info', visibility: 'admin',
    });
    return result;
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
