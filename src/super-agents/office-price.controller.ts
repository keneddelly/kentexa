import { Body, Controller, Get, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';
import { OfficePriceService } from './office-price.service';
import type { OfficeQuoteRequest } from './office-price.service';
import { RouteRangeService } from './route-range.service';

// The office price rule: the "Bei" page and the counter preview. Active Super Agent only.
@Controller('super-agents')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.SUPER_AGENT)
export class OfficePriceController {
  constructor(private readonly prices: OfficePriceService, private readonly ranges: RouteRangeService) {}

  @Get('me/price-rule')
  getRule(@Request() req, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.getMyRule(req.user, roleContext);
  }

  @Put('me/price-rule')
  setRule(@Request() req, @Body() dto: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.setMyRule(req.user, roleContext, dto);
  }

  // Does this office collect from senders (free, or for its own fee)? Shown in the send form.
  @Get('me/pickup')
  getPickup(@Request() req, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.getMyPickup(req.user, roleContext);
  }

  @Put('me/pickup')
  setPickup(@Request() req, @Body() dto: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.setMyPickup(req.user, roleContext, dto);
  }

  // The counter preview: pickup, transport, delivery and total for this parcel.
  @Post('me/price-quote')
  quote(@Request() req, @Body() dto: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.previewMine(req.user, roleContext, dto as OfficeQuoteRequest);
  }

  // The anonymous market range on this office's route to a destination, and its position.
  @Get('me/route-range')
  routeRange(@Request() req, @Query('destinationCity') destinationCity: string, @Query('weightKg') weightKg: string,
    @CurrentRoleContext() roleContext: RoleContext) {
    return this.ranges.mine(req.user, roleContext, { destinationCity, weightKg });
  }
}
