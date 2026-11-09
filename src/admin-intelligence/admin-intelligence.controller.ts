import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AdminIntelligenceService } from './admin-intelligence.service';
import { AdminOverviewService } from './admin-overview.service';
import { OnboardingFunnelService } from './onboarding-funnel.service';
import { ADMIN_DATASETS, AdminDataService } from './admin-data.service';
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
    private readonly data: AdminDataService,
    private readonly onboarding: OnboardingFunnelService,
  ) {}

  /** Stage 3 (owner 2026-11-09): every kind of data, listed for the admin. */
  @Get('data')
  datasets() {
    return ADMIN_DATASETS;
  }

  @Get('data/:dataset')
  dataset(@Param('dataset') dataset: string, @Query('q') q?: string, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.data.list(dataset, { q, status, limit: Number(limit) || undefined });
  }

  /** A reported Moment: hide it or keep it; its open reports are closed. */
  @Post('reports/:id/review')
  reviewReport(@Param('id', ParseIntPipe) id: number, @Body() body: { decision?: string }, @Request() req: any) {
    return this.data.reviewReport(id, req.user.id, body?.decision as any);
  }

  /** The admin Muhtasari: every count in one call, from the database (owner 2026-11-09). */
  @Get('overview')
  getOverview() {
    return this.overviewService.overview();
  }

  /** Onboarding progress: of the people who joined in the last N days, how many reached each step. */
  @Get('onboarding')
  getOnboarding(@Query('days') days: string) {
    return this.onboarding.funnel(Number(days) || 30);
  }

  @Get('platform')
  getPlatform(@Query('days') days: string) {
    return this.service.getPlatformIntelligence(Number(days) || 7);
  }
}
