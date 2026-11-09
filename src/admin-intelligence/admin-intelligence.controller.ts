import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminIntelligenceService } from './admin-intelligence.service';
import { AdminOverviewService } from './admin-overview.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('admin-intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminIntelligenceController {
  constructor(
    private readonly service: AdminIntelligenceService,
    private readonly overviewService: AdminOverviewService,
  ) {}

  /** The admin Muhtasari: every count in one call, from the database (owner 2026-11-09). */
  @Get('overview')
  getOverview() {
    return this.overviewService.overview();
  }

  @Get('platform')
  getPlatform(@Query('days') days: string) {
    return this.service.getPlatformIntelligence(Number(days) || 7);
  }
}
