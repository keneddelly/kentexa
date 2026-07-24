import {
  Controller, Get, Post, Patch, Body,
  Param, ParseIntPipe, UseGuards, Request, Query,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { JwtAuthGuard }  from '../auth/auth.guard';
import { RolesGuard }    from '../auth/roles.guard';
import { Roles }         from '../auth/roles.decorator';
import { UserRole }      from '../users/entities/user.entity';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(private service: AgentsService) {}

  // ── Agent: toggle online/offline ─────────────────────────────────────────
  @Patch('toggle-online')
  toggleOnline(@Request() req) {
    return this.service.toggleOnline(req.user);
  }

  // ── Agent: update own profile ─────────────────────────────────────────────
  @Patch('my-profile')
  updateProfile(@Request() req, @Body() body: any) {
    return this.service.updateProfile(req.user, body);
  }

  // ── Public: available online agents in a city ────────────────────────────
  @Get('available')
  getAvailableAgents(
    @Query('city') city: string,
    @Query('weight') weight?: string,
  ) {
    return this.service.getAvailableAgents(city, weight ? Number(weight) : undefined);
  }

  // ── Public: find agents by city (for Super Agent dispatch modal) ──────────
  @Get('nearby')
  findByCity(@Query('region') region: string, @Query('city') city: string) {
    return this.service.findByCity(city || region || '');
  }

  // ── Agent: apply ─────────────────────────────────────────────────────────
  @Post('register')
  register(@Request() req, @Body() body: any) {
    return this.service.register(req.user, body);
  }

  // ── Agent: my profile ─────────────────────────────────────────────────────
  @Get('my-profile')
  getMyProfile(@Request() req) {
    return this.service.getMyProfile(req.user);
  }

  // ── Admin: agents with pending earnings ──────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/pending-earnings')
  getPendingEarnings() {
    return this.service.getAgentsPendingEarnings();
  }

  // ── Admin: release agent earnings ─────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/release-earnings')
  releaseEarnings(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number; note?: string },
  ) {
    return this.service.releaseEarnings(id, body.amount, body.note);
  }

  // ── Admin: all agents ─────────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/all')
  findAll(
    @Query('status') status?: string,
    @Query('city')   city?: string,
  ) {
    return this.service.findAll({ status, city });
  }

  // ── Admin: approve ────────────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.service.approve(id);
  }

  // ── Admin: reject ─────────────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason: string },
  ) {
    return this.service.reject(id, body.reason);
  }

  // ── Admin: suspend ────────────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/suspend')
  suspend(@Param('id', ParseIntPipe) id: number) {
    return this.service.suspend(id);
  }

  // ── Admin: update settings ────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/settings')
  updateSettings(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.service.updateSettings(id, body);
  }
}