import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';
import { OfficePriceService } from './office-price.service';
import type { OfficeQuoteRequest } from './office-price.service';

// The office price rule: the "Bei" page and the counter preview. Active Super Agent only.
@Controller('super-agents')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.SUPER_AGENT)
export class OfficePriceController {
  constructor(private readonly prices: OfficePriceService) {}

  @Get('me/price-rule')
  getRule(@Request() req, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.getMyRule(req.user, roleContext);
  }

  @Put('me/price-rule')
  setRule(@Request() req, @Body() dto: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.setMyRule(req.user, roleContext, dto);
  }

  // The counter preview: pickup, transport, delivery and total for this parcel.
  @Post('me/price-quote')
  quote(@Request() req, @Body() dto: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.prices.previewMine(req.user, roleContext, dto as OfficeQuoteRequest);
  }
}
