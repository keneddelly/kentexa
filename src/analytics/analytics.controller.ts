import { Controller, Post, Get, Body, Param, Query, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { Request } from 'express';

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

  // Admin — dashboard stats
  @Get('dashboard')
  getDashboard(@Query('days') days: string) {
    return this.service.getDashboardStats(Number(days) || 7);
  }

  // Admin — recent live events
  @Get('events/recent')
  getRecentEvents(@Query('limit') limit: string) {
    return this.service.getRecentEvents(Number(limit) || 50);
  }

  // Admin — session detail
  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.service.getSessionDetail(sessionId);
  }
}
