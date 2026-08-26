import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BusinessOwnerGuard } from './guards/business-owner.guard';

@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('business/:businessId/summary')
  @UseGuards(BusinessOwnerGuard)
  getBusinessSummary(
    @Param('businessId', ParseIntPipe) businessId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.activityService.getBusinessSummary(businessId, { from, to });
  }

  @Get('admin/dashboard')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminDashboard(@Query('from') from?: string, @Query('to') to?: string) {
    return this.activityService.getAdminDashboard({ from, to });
  }
}
