import { Body, Controller, Get, HttpCode, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ActivityEventService } from './activity-event.service';
import { ActivityCategory } from './entities/activity-event.entity';
import { cleanClientError } from './client-errors';

/**
 * Page error reports (owner approved 2026-11-15). Each report becomes one CLIENT_ERROR
 * ActivityEvent (category SYSTEM, visible to the system only), so it shows in the admin's
 * Activity page and in the summary below. Signed out visitors can report too.
 */
@Controller('client-errors')
export class ClientErrorsController {
  constructor(
    private readonly events: ActivityEventService,
    private readonly dataSource: DataSource,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(204)
  @Post()
  async report(@Body() body: any, @Request() req): Promise<void> {
    const report = cleanClientError(body, req?.headers?.['user-agent']);
    if (!report) return;
    await this.events.record({
      eventType: 'CLIENT_ERROR',
      category: ActivityCategory.SYSTEM,
      actorId: req?.user?.id ?? null,
      actorType: req?.user?.id ? 'user' : 'visitor',
      targetType: 'page',
      metadata: report as any,
      severity: report.kind === 'slow' ? 'info' : 'warning',
      visibility: 'system',
    });
  }

  /** Admin: the most common page errors of the last days, with the browsers they happen on. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/summary')
  async summary(@Query('days') days?: string) {
    const d = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 90);
    const rows = await this.dataSource.query(
      `SELECT e.metadata->>'kind' AS kind,
              COALESCE(e.metadata->>'page', e.metadata->>'path') AS page,
              e.metadata->>'message' AS message,
              COUNT(*)::int AS count,
              COUNT(DISTINCT e."actorId")::int AS people,
              MAX(e."createdAt") AS "lastSeen",
              array_agg(DISTINCT (e.metadata->'browser'->>'name') || ' ' || COALESCE(e.metadata->'browser'->>'version', '?')) AS browsers,
              array_agg(DISTINCT e.metadata->>'appMode') AS "appModes"
         FROM public.activity_events e
        WHERE e."eventType" = 'CLIENT_ERROR' AND e."createdAt" > NOW() - ($1 || ' days')::interval
        GROUP BY 1, 2, 3
        ORDER BY count DESC
        LIMIT 100`, [String(d)]).catch(() => []);
    return { days: d, errors: rows };
  }
}
