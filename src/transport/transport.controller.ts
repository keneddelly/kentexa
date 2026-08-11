/**
 * TransportController
 * Place at: src/transport/transport.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { TransportService } from './transport.service';
import { AssignmentStatus } from './entities/transport-assignment.entity';
import { AvailabilityStatus } from './entities/provider-availability.entity';

@Controller('transport')
export class TransportController {
  constructor(private readonly svc: TransportService) {}

  // ── PROVIDER REGISTRATION ─────────────────────────────────────────────────
  @Post('register')
  @UseGuards(JwtAuthGuard)
  register(@Request() req, @Body() dto: any) {
    return this.svc.register(req.user, dto);
  }

  @Get('my-profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return this.svc.getMyProfile(req.user.id);
  }

  @Patch('my-profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@Request() req, @Body() dto: any) {
    return this.svc.updateProfile(req.user.id, dto);
  }

  // ── ROUTES ────────────────────────────────────────────────────────────────
  @Post('routes')
  @UseGuards(JwtAuthGuard)
  addRoute(@Request() req, @Body() dto: any) {
    return this.svc.addRoute(req.user.id, dto);
  }

  @Get('routes')
  @UseGuards(JwtAuthGuard)
  getRoutes(@Request() req) {
    return this.svc.getMyRoutes(req.user.id);
  }

  // ── Public: provider info + routes for viewing any provider's profile ────
  @Get('public/:userId')
  getPublicProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.findPublicByUserId(userId);
  }

  @Patch('routes/:id')
  @UseGuards(JwtAuthGuard)
  updateRoute(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.svc.updateRoute(req.user.id, id, dto);
  }

  // ── AVAILABILITY ─────────────────────────────────────────────────────────
  @Post('availability')
  @UseGuards(JwtAuthGuard)
  publishAvailability(@Request() req, @Body() dto: any) {
    return this.svc.publishAvailability(req.user.id, dto);
  }

  @Get('availability')
  @UseGuards(JwtAuthGuard)
  getMyAvailability(@Request() req, @Query('days') days?: string) {
    return this.svc.getMyAvailability(req.user.id, days ? Number(days) : 7);
  }

  @Patch('availability/:id/status')
  @UseGuards(JwtAuthGuard)
  updateAvailStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: AvailabilityStatus,
  ) {
    return this.svc.updateAvailabilityStatus(req.user.id, id, status);
  }

  // ── SUPER AGENT: FIND TRANSPORT ───────────────────────────────────────────
  @Get('available') // Public — used on homepage
  findAvailable(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.findAvailableForRoute(from, to);
  }

  // ── PUBLIC: CONSUMER SEARCH (AI front door) ───────────────────────────────
  // Lean, consumer-safe provider cards — not the dispatch-internal shape
  // returned by /available above.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('search-public')
  findPublic(@Query('from') from: string, @Query('to') to: string) {
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException('Both "from" and "to" city are required.');
    }
    return this.svc.findPublicProvidersForRoute(from.trim(), to.trim());
  }

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────
  @Post('assignments')
  @UseGuards(JwtAuthGuard)
  createAssignment(@Request() req, @Body() dto: any) {
    return this.svc.createAssignment(req.user, dto);
  }

  @Get('assignments')
  @UseGuards(JwtAuthGuard)
  getAssignments(@Request() req, @Query('status') status?: string) {
    return this.svc.getMyAssignments(req.user.id, status);
  }

  @Patch('assignments/:id/respond')
  @UseGuards(JwtAuthGuard)
  respondToAssignment(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { accept: boolean; declineReason?: string },
  ) {
    return this.svc.respondToAssignment(
      req.user.id,
      id,
      dto.accept,
      dto.declineReason,
    );
  }

  @Patch('assignments/:id/status')
  @UseGuards(JwtAuthGuard)
  updateAssignmentStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: { status: AssignmentStatus; proofUrl?: string; notes?: string },
  ) {
    return this.svc.updateAssignmentStatus(req.user.id, id, dto);
  }

  @Get('assignments/track/:trackingNumber')
  trackAssignment(@Param('trackingNumber') tn: string) {
    return this.svc.getAssignmentByTracking(tn);
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  @Get('admin/providers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminAll(@Query('status') status?: string) {
    return this.svc.adminGetAll(status);
  }

  @Patch('admin/providers/:id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminVerify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { approve: boolean; reason?: string },
  ) {
    return this.svc.adminVerify(id, dto.approve, dto.reason);
  }

  @Get('admin/assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminAssignments(@Query() q: any) {
    return this.svc.adminGetAssignments(q);
  }
}
