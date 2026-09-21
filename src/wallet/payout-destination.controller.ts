import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';
import { PayoutDestinationService } from './payout-destination.service';

/**
 * Business payout destination endpoints. The workspace is ALWAYS the acting
 * BUSINESS context's; no workspaceId/businessId is accepted from the request.
 */
@Controller('business/payout-destinations')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class PayoutDestinationController {
  constructor(private destinations: PayoutDestinationService) {}

  @Get()
  list(@CurrentRoleContext() ctx: RoleContext) {
    return this.destinations.listForContext(ctx);
  }

  @Post()
  create(
    @CurrentRoleContext() ctx: RoleContext,
    @Body() dto: { method: string; accountName: string; accountNumber: string; bankName?: string },
  ) {
    return this.destinations.create(ctx, dto);
  }

  @Post(':id/disable')
  disable(@CurrentRoleContext() ctx: RoleContext, @Param('id', ParseIntPipe) id: number) {
    return this.destinations.disable(ctx, id);
  }
}

@Controller('admin/payout-destinations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPayoutDestinationController {
  constructor(private destinations: PayoutDestinationService) {}

  @Post(':id/verify')
  verify(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { verificationMethod?: string; verificationRef?: string },
  ) {
    return this.destinations.verify(req.user.id, id, body ?? {});
  }
}
