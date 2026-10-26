import { Body, Controller, Get, Header, Param, ParseIntPipe, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { AdvertisersService } from './advertisers.service';

@Controller('advertisers')
export class AdvertisersController {
  constructor(private readonly service: AdvertisersService) {}

  // ── The advertiser: my link, the users I brought, what I earned ──────────
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @Header('Cache-Control', 'no-store')
  mine(@Request() req) {
    return this.service.mine(req.user.id, req.user.phone);
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.ADMIN)
  @Get()
  @Header('Cache-Control', 'no-store')
  list() {
    return this.service.list();
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.ADMIN)
  @Post()
  create(@Body() body: { name?: string; phone?: string }) {
    return this.service.create(body);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.ADMIN)
  @Patch(':id/active')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() body: { active: boolean }) {
    return this.service.setActive(id, Boolean(body?.active));
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.ADMIN)
  @Put('rates')
  setRates(@Body() body: Record<string, unknown>) {
    return this.service.setRates(body);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.ADMIN)
  @Post(':id/paid')
  markPaid(@Param('id', ParseIntPipe) id: number) {
    return this.service.markPaid(id);
  }
}
