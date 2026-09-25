import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ParcelCollectionsService } from './parcel-collections.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class ParcelCollectionsController {
  constructor(private service: ParcelCollectionsService) {}

  // ── Agent: available collection jobs in my city ──────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.AGENT)
  @Get('available')
  getAvailable(@Request() req) {
    return this.service.getAvailableCollections(req.user);
  }

  // ── Agent: my active collection jobs ────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.AGENT)
  @Get('my-collections')
  getMyCollections(@Request() req) {
    return this.service.getMyCollections(req.user);
  }

  // ── Agent: claim a collection job ────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.AGENT)
  @Post(':id/claim')
  claim(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.claimCollection(id, req.user);
  }

  // ── Agent: confirm picked up from seller ─────────────────────────────────
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.AGENT)
  @Patch(':id/collected')
  confirmCollected(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { notes?: string },
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    return this.service.confirmCollected(id, req.user, body.notes, roleContext);
  }

  // ── Agent: confirm handed to Super Agent hub ─────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.AGENT)
  @Patch(':id/handed-over')
  confirmHandedOver(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.confirmHandedOver(id, req.user);
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  @Get('hub/handover-requests')
  getHubHandoverRequests(@Request() req, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.getHubHandoverRequests(req.user, roleContext);
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  @Patch(':id/hub-accept')
  acceptHubHandover(
    @Param('id', ParseIntPipe) id: number, @Request() req,
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    return this.service.acceptHubHandover(id, req.user, roleContext);
  }

  // ── Admin: all collections ───────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/all')
  getAll(@Query('status') status?: string, @Query('city') city?: string) {
    return this.service.getAllCollections({ status, city });
  }

  // ── Admin: manually assign agent ─────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch('admin/:id/assign')
  adminAssign(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { agentUserId: number },
  ) {
    return this.service.adminAssignAgent(id, body.agentUserId);
  }

  // ── Admin: cancel (no agent available) ───────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch('admin/:id/cancel')
  adminCancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason: string },
  ) {
    return this.service.adminCancel(id, body.reason);
  }
}
