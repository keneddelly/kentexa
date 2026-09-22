import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
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

// Financial administration: canonical RoleContext + exact ACTIVE admin role (never legacy User.role).
@Controller('admin/payout-destinations')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.ADMIN)
export class AdminPayoutDestinationController {
  constructor(private destinations: PayoutDestinationService) {}

  @Post(':id/verify')
  verify(
    @CurrentRoleContext() ctx: RoleContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { verificationMethod?: string; verificationRef?: string },
  ) {
    // The mutation actor is the validated RoleContext's user, not a request-level user field.
    return this.destinations.verify(ctx.userId, id, body ?? {});
  }
}
