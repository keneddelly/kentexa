import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';

/**
 * Business Capability Activation Stage B3. Admin review surface for
 * Commerce applications. RolesGuard (existing Kentexa convention, same as
 * SellerController's own admin routes) resolves authority from the
 * caller's CURRENTLY ACTIVE RoleContext -- never a raw User.role column --
 * so a stale/superseded admin session is denied exactly like every other
 * admin-gated endpoint in this codebase (see roles.guard.ts's own doc
 * comment). applicationId is the only identity ever taken from the
 * request; every other id (businessId/workspaceId/SellerProfile id/
 * AccountRole id/capabilityCode) is resolved server-side from the
 * persisted application row inside the service.
 */
@Controller('admin/business-capability-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminBusinessCapabilityApplicationController {
  constructor(private readonly capabilityApplications: BusinessCapabilityApplicationService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query('status') status?: string) {
    return this.capabilityApplications.listForAdmin(status);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.capabilityApplications.approveApplication(id, req.user);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() dto: { rejectionReason?: string },
  ) {
    return this.capabilityApplications.rejectApplication(id, req.user, dto?.rejectionReason ?? '');
  }
}
