import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { MoneyRoutingService } from './money-routing.service';

/** Admin view of BLOCKED money routing (stable reason + identifiers for manual investigation). Never changes ownership. */
// Financial administration: canonical RoleContext + exact ACTIVE admin role (never legacy User.role).
@Controller('admin/money-routing')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.ADMIN)
export class MoneyRoutingAdminController {
  constructor(private routing: MoneyRoutingService) {}

  @Get('blocked')
  blocked() {
    return this.routing.listBlocked();
  }

  /** BLOCKED -> PENDING after the underlying data was fixed by an approved process; the target is re-derived, not supplied. */
  @Post(':id/resolve')
  async resolve(@CurrentRoleContext() ctx: RoleContext, @Param('id', ParseIntPipe) id: number, @Body('note') note: string) {
    await this.routing.resolveBlocked(id, ctx.userId, note ?? '');
    return this.routing.routeEntry(id);
  }
}
