/**
 * VanPilotController — Stage 3S-C8: the missing HTTP surface over
 * TransportRunService/ParcelRunAssignmentService/ParcelJourneyService.
 *
 * Before this gate, both core services were fully built, transactional,
 * ownership-scoped, custody-event-writing, and real-Postgres-spec-tested --
 * but zero controller anywhere injected either of them (confirmed by the
 * C8 pre-implementation audit). This controller adds exactly the routes
 * C8-A/B/C/F require; it introduces no new business logic of its own
 * (every handler is a thin pass-through), and every ownership/authority
 * check still happens inside the services themselves, exactly as it
 * already did for the existing TransportController routes above.
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
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
import { TransportRunService } from './transport-run.service';
import type { AddRouteStopDto, UpdateRouteStopDto, CreateRunDto, AddVehicleDto, UpdateVehicleDto } from './transport-run.service';
import { ParcelRunAssignmentService } from './parcel-run-assignment.service';
import type { CreateParcelRunAssignmentDto } from './parcel-run-assignment.service';
import { ParcelJourneyService } from './parcel-journey.service';

const PROVIDER_OR_ADMIN = [AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN] as const;

@Controller('van-pilot')
export class VanPilotController {
  constructor(
    private readonly runs: TransportRunService,
    private readonly assignments: ParcelRunAssignmentService,
    private readonly journey: ParcelJourneyService,
  ) {}

  // ── PROVIDER: route stops (reusable plan) ──────────────────────────────────
  @Post('routes/:routeId/stops')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  addRouteStop(@CurrentRoleContext() ctx: RoleContext, @Param('routeId', ParseIntPipe) routeId: number, @Body() dto: AddRouteStopDto) {
    return this.runs.addRouteStop(ctx.userId, routeId, dto);
  }

  @Get('routes/:routeId/stops')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  listRouteStops(@CurrentRoleContext() ctx: RoleContext, @Param('routeId', ParseIntPipe) routeId: number) {
    return this.runs.listRouteStops(ctx.userId, routeId);
  }

  @Patch('routes/:routeId/stops/:stopId')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  updateRouteStop(
    @CurrentRoleContext() ctx: RoleContext,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Param('stopId', ParseIntPipe) stopId: number,
    @Body() dto: UpdateRouteStopDto,
  ) {
    return this.runs.updateRouteStop(ctx.userId, routeId, stopId, dto);
  }

  @Patch('routes/:routeId/stops/:stopId/reorder')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  reorderRouteStop(
    @CurrentRoleContext() ctx: RoleContext,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Param('stopId', ParseIntPipe) stopId: number,
    @Body('sequence', ParseIntPipe) sequence: number,
  ) {
    return this.runs.reorderRouteStop(ctx.userId, routeId, stopId, sequence);
  }

  @Patch('routes/:routeId/stops/:stopId/deactivate')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  deactivateRouteStop(
    @CurrentRoleContext() ctx: RoleContext,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Param('stopId', ParseIntPipe) stopId: number,
  ) {
    return this.runs.deactivateRouteStop(ctx.userId, routeId, stopId);
  }

  // ── PROVIDER: Runs ───────────────────────────────────────────────────────
  @Post('runs')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  createRun(@CurrentRoleContext() ctx: RoleContext, @Body() dto: CreateRunDto) {
    return this.runs.createRun(ctx.userId, dto);
  }

  @Get('runs')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  listMyRuns(@CurrentRoleContext() ctx: RoleContext) {
    return this.runs.listMyRuns(ctx.userId);
  }

  @Get('runs/:runId/stops')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN)
  getRunStops(@Param('runId', ParseIntPipe) runId: number) {
    return this.runs.getRunStops(runId);
  }

  @Get('runs/:runId/assignments')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN)
  getRunAssignments(@Param('runId', ParseIntPipe) runId: number) {
    return this.assignments.getAssignmentsForRun(runId);
  }

  // ── PROVIDER: Vehicles ───────────────────────────────────────────────────
  @Post('vehicles')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  addVehicle(@CurrentRoleContext() ctx: RoleContext, @Body() dto: AddVehicleDto) {
    return this.runs.addVehicle(ctx.userId, dto);
  }

  @Get('vehicles')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  listVehicles(@CurrentRoleContext() ctx: RoleContext) {
    return this.runs.listVehicles(ctx.userId);
  }

  @Patch('vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  updateVehicle(@CurrentRoleContext() ctx: RoleContext, @Param('vehicleId', ParseIntPipe) vehicleId: number, @Body() dto: UpdateVehicleDto) {
    return this.runs.updateVehicle(ctx.userId, vehicleId, dto);
  }

  @Patch('vehicles/:vehicleId/deactivate')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  deactivateVehicle(@CurrentRoleContext() ctx: RoleContext, @Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.runs.deactivateVehicle(ctx.userId, vehicleId);
  }

  @Post('runs/:runId/vehicle')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  assignVehicleToRun(
    @CurrentRoleContext() ctx: RoleContext,
    @Param('runId', ParseIntPipe) runId: number,
    @Body('vehicleId', ParseIntPipe) vehicleId: number,
  ) {
    return this.runs.assignVehicleToRun(ctx.userId, runId, vehicleId);
  }

  // ── PROVIDER: Parcel-Run assignments (load/unload) ──────────────────────
  @Post('assignments')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  createAssignment(@CurrentRoleContext() ctx: RoleContext, @Body() dto: CreateParcelRunAssignmentDto) {
    return this.assignments.createAssignment(ctx.userId, dto);
  }

  @Patch('assignments/:assignmentId/loaded')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  markLoaded(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.markLoaded(ctx, assignmentId);
  }

  @Patch('assignments/:assignmentId/unloaded')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  markUnloaded(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.markUnloaded(ctx, assignmentId);
  }

  @Patch('assignments/:assignmentId/cancel')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...PROVIDER_OR_ADMIN)
  cancelAssignment(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.cancelAssignment(ctx.userId, assignmentId);
  }

  // ── SUPER AGENT: receiving desk ──────────────────────────────────────────
  @Patch('assignments/:assignmentId/confirm-receipt')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN)
  confirmReceipt(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.confirmReceipt(ctx, assignmentId);
  }

  // ── Shared: parcel journey context / eligible Runs ──────────────────────
  // Any operational actor may look up where a parcel is and what Runs it
  // could join -- read-only, never a write; ownership for the actual write
  // (createAssignment etc.) is still enforced inside those services.
  @Get('parcels/:parcelId/journey')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT, AccountRoleType.AGENT, AccountRoleType.ADMIN)
  getParcelJourney(@Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.journey.resolveJourneyContext(parcelId);
  }

  @Get('parcels/:parcelId/eligible-runs')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN)
  getEligibleRuns(@Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.journey.findEligibleRuns(parcelId);
  }

  // ── ADMIN: operational visibility ───────────────────────────────────────
  // Matches this codebase's simplest existing admin pattern
  // (admin-intelligence.controller.ts) -- no ownership scoping needed.
  @Get('admin/runs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminListRuns() {
    return this.runs.adminListRuns();
  }

  @Get('admin/runs/:runId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminGetRunDetail(@Param('runId', ParseIntPipe) runId: number) {
    return this.runs.adminGetRunDetail(runId);
  }

  @Get('admin/parcels/blocked')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminBlockedParcels() {
    return this.journey.adminListBlockedAwaitingSuperAgentReceipt();
  }

  @Get('admin/parcels/awaiting-completion')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminAwaitingCompletion() {
    return this.journey.adminListAwaitingLastMileCompletion();
  }
}
