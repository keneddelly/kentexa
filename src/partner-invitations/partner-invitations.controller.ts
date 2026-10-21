import { Body, Controller, Get, Header, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';
import { PartnerInvitationsService } from './partner-invitations.service';
import type { CreatePartnerInvitationDto } from './partner-invitations.service';

@Controller('partner-invitations')
export class PartnerInvitationsController {
  constructor(private readonly service: PartnerInvitationsService) {}

  // ── The inviting office (active Super Agent only) ─────────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Request() req, @Body() dto: CreatePartnerInvitationDto, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.create(req.user, roleContext, dto);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  @Get('mine')
  listMine(@Request() req, @CurrentRoleContext() roleContext: RoleContext, @Query('parcelId') parcelId?: string) {
    return this.service.listMine(req.user, roleContext, parcelId ? Number(parcelId) : undefined);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  @Patch(':id/confirm')
  confirm(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.confirm(req.user, roleContext, id);
  }

  // ── The invitee ───────────────────────────────────────────────────────────
  // Public: the link is the key. Shows the waybill summary and marks it opened.
  @Get('link/:token')
  @Header('Cache-Control', 'no-store')
  view(@Param('token') token: string) {
    return this.service.publicView(token);
  }

  // Login required; any role (a new account is a buyer until its application is approved).
  @UseGuards(JwtAuthGuard)
  @Post('link/:token/accept')
  accept(@Request() req, @Param('token') token: string) {
    return this.service.accept(req.user, token);
  }
}
