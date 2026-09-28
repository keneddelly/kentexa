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

/**
 * Draft first-mile: request, claim (Stage 3S) and the physical handoffs
 * (Stage 3S-A). Every physical step needs its own actor's active role.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class PickupTasksController {
  constructor(private readonly tasks: PickupTasksService) {}

  @Post('shipments/:id/pickup-task')
  requestPickup(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: RequestPickupDto) {
    return this.tasks.requestForShipment(req.user.id, id, body);
  }

  @Post('shipments/:id/pickup-task/handoff-code')
  issueHandoffCode(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.issueHandoffCode(req.user.id, id);
  }

  @Post('shipments/:id/pickup-task/cancel')
  cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.cancel(req.user.id, id);
  }

  @Post('pickup-tasks/:id/collect')
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.AGENT)
  collect(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: { code: string },
    @CurrentRoleContext() role: RoleContext) {
    return this.tasks.collect(id, req.user.id, role, body?.code);
  }

  @Post('pickup-tasks/:id/handover-request')
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.AGENT)
  requestHubHandover(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() role: RoleContext) {
    return this.tasks.requestHubHandover(id, req.user.id, role);
  }

  @Post('pickup-tasks/:id/hub-receive')
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  hubReceive(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() role: RoleContext) {
    return this.tasks.hubReceive(id, req.user.id, role);
  }

  @Post('pickup-tasks/:id/claim')
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.AGENT)
  claim(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() role: RoleContext) {
    return this.tasks.claim(id, req.user.id, role);
  }
}
