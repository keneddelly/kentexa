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
