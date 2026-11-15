import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  // Public — called by frontend on every event (no auth required — speed critical)
  @Post('event')
  async trackEvent(@Body() dto: any, @Req() req: Request) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    // Fire and forget — don't await, never block the user
    this.service.trackEvent({ ...dto, ipAddress }).catch(() => {});
    return { ok: true };
  }

  /**
   * Issue #361: the site sends its events in small groups (about one call every 10 seconds)
   * instead of one call per event, so tracking no longer uses up the API's request limits.
   * At most 50 events a call; same handling as /analytics/event.
   */
  @Post('events')
  async trackEvents(@Body() body: any, @Req() req: Request) {
    const events = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    // In order, one after another (the first event may open the session); never blocks.
    (async () => {
      for (const e of events) {
        if (e && typeof e === 'object' && typeof e.sessionId === 'string' && typeof e.eventType === 'string') {
          await this.service.trackEvent({ ...e, ipAddress }).catch(() => {});
        }
      }
    })().catch(() => {});
    return { ok: true, received: events.length };
  }

  // Admin — dashboard stats
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('dashboard')
  getDashboard(@Query('days') days: string) {
    return this.service.getDashboardStats(Number(days) || 7);
  }

  // Admin — recent live events
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('events/recent')
  getRecentEvents(@Query('limit') limit: string) {
    return this.service.getRecentEvents(Number(limit) || 50);
  }

  // Admin — session detail (contains the visitor's IP address — admin only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.service.getSessionDetail(sessionId);
  }
}
