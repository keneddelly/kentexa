import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BusinessCapabilityLifecycleService } from './business-capability-lifecycle.service';

/**
 * Business Capability Activation Stage B4. Admin lifecycle surface for an
 * EXISTING BusinessCapability (organizational entitlement), distinct from
 * AdminBusinessCapabilityApplicationController's B3 application-review
 * routes. Same canonical convention: JwtAuthGuard + RolesGuard resolves
 * authority from the caller's currently active RoleContext (never a raw
 * User.role column), same as every other admin-gated endpoint in this
 * codebase. `id` (the BusinessCapability's own id) is the only identity
 * ever taken from the route; `reason` is the only body field ever read,
 * and only on suspend -- reactivate accepts no body at all. Every other
 * identity (businessId/workspaceId/capabilityCode/status/actor) is
 * resolved server-side inside BusinessCapabilityLifecycleService.
 */
@Controller('admin/business-capabilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminBusinessCapabilityController {
  constructor(private readonly lifecycle: BusinessCapabilityLifecycleService) {}

  @Post(':id/suspend')
  @Roles(UserRole.ADMIN)
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() dto: { reason?: string },
  ) {
    return this.lifecycle.suspend(id, req.user, dto?.reason ?? '');
  }

  @Post(':id/reactivate')
  @Roles(UserRole.ADMIN)
  reactivate(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.lifecycle.reactivate(id, req.user);
  }
}
