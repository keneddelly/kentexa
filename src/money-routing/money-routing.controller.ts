import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MoneyRoutingService } from './money-routing.service';

/** Admin view of BLOCKED money routing (stable reason + identifiers for manual investigation). Never changes ownership. */
@Controller('admin/money-routing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MoneyRoutingAdminController {
  constructor(private routing: MoneyRoutingService) {}

  @Get('blocked')
  blocked() {
    return this.routing.listBlocked();
  }

  /** BLOCKED -> PENDING after the underlying data was fixed by an approved process; the target is re-derived, not supplied. */
  @Post(':id/resolve')
  async resolve(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('note') note: string) {
    await this.routing.resolveBlocked(id, req.user.id, note ?? '');
    return this.routing.routeEntry(id);
  }
}
