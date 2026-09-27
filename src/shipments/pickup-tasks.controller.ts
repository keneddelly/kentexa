import { Body, Controller, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { PickupTasksService } from './pickup-tasks.service';
import type { RequestPickupDto } from './pickup-tasks.service';

/** Draft first-mile request and claim; no physical handoff is exposed here. */
@Controller()
@UseGuards(JwtAuthGuard)
export class PickupTasksController {
  constructor(private readonly tasks: PickupTasksService) {}

  @Post('shipments/:id/pickup-task')
  requestPickup(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: RequestPickupDto) {
    return this.tasks.requestForShipment(req.user.id, id, body);
  }

  @Post('pickup-tasks/:id/claim')
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.AGENT)
  claim(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() role: RoleContext) {
    return this.tasks.claim(id, req.user.id, role);
  }
}
