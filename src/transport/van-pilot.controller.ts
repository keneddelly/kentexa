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
 *
 * Stage 3S-C8 review correction: every provider-owned operational route
 * (route stops, runs, vehicles, assignments create/load/unload/cancel)
 * resolves authority through TransportService.getMyProfile(ctx.userId) --
 * it requires the CALLER THEMSELF to own exactly one TransportProvider
 * profile. Originally admitting AccountRoleType.ADMIN alongside
 * TRANSPORT_PROVIDER on these routes advertised an authority that didn't
 * exist: an ordinary admin active-role user would pass this controller's
 * own guard and then hit "Transport account not found" inside the service,
 * since no admin-on-behalf-of-provider resolution exists anywhere in this
 * codebase. Rather than inventing a new impersonation model, these routes
 * are now TRANSPORT_PROVIDER-only; admin visibility stays exactly where it
 * already correctly lived -- the separate /van-pilot/admin/* endpoints
 * below, which never resolve through a caller-owned provider profile at
 * all. confirmReceipt has the identical shape (assertSuperAgentAuthority
 * requires the caller to own the specific super_agent row) and is
 * corrected the same way -- SUPER_AGENT only.
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
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  addRouteStop(@CurrentRoleContext() ctx: RoleContext, @Param('routeId', ParseIntPipe) routeId: number, @Body() dto: AddRouteStopDto) {
    return this.runs.addRouteStop(ctx.userId, routeId, dto);
  }

  @Get('routes/:routeId/stops')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  listRouteStops(@CurrentRoleContext() ctx: RoleContext, @Param('routeId', ParseIntPipe) routeId: number) {
    return this.runs.listRouteStops(ctx.userId, routeId);
  }

  @Patch('routes/:routeId/stops/:stopId')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
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
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
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
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
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
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  createRun(@CurrentRoleContext() ctx: RoleContext, @Body() dto: CreateRunDto) {
    return this.runs.createRun(ctx.userId, dto);
  }

  @Get('runs')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  listMyRuns(@CurrentRoleContext() ctx: RoleContext) {
    return this.runs.listMyRuns(ctx.userId);
  }

  @Patch('runs/:runId/cancel')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  cancelRun(@CurrentRoleContext() ctx: RoleContext, @Param('runId', ParseIntPipe) runId: number) {
    return this.runs.cancelRun(ctx.userId, runId);
  }

  // Van Pilot Readiness hardening: these shared operational reads are no
  // longer globally enumerable across providers/hubs. The controller admits
  // provider and Super Agent roles; assertRunOperationalVisibility then
  // requires provider ownership or actual hub participation in the immutable
  // Run itinerary. Admin uses the dedicated /admin read models below.
  @Get('runs/:runId/stops')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT)
  async getRunStops(@CurrentRoleContext() ctx: RoleContext, @Param('runId', ParseIntPipe) runId: number) {
    await this.runs.assertRunOperationalVisibility(ctx.userId, ctx.roleType, ctx.profileId ?? null, runId);
    return this.runs.getRunStops(runId);
  }

  @Get('runs/:runId/assignments')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT)
  async getRunAssignments(@CurrentRoleContext() ctx: RoleContext, @Param('runId', ParseIntPipe) runId: number) {
    await this.runs.assertRunOperationalVisibility(ctx.userId, ctx.roleType, ctx.profileId ?? null, runId);
    return this.assignments.getAssignmentsForRun(runId);
  }

  // ── PROVIDER: Vehicles ───────────────────────────────────────────────────
  @Post('vehicles')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  addVehicle(@CurrentRoleContext() ctx: RoleContext, @Body() dto: AddVehicleDto) {
    return this.runs.addVehicle(ctx.userId, dto);
  }

  @Get('vehicles')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  listVehicles(@CurrentRoleContext() ctx: RoleContext) {
    return this.runs.listVehicles(ctx.userId);
  }

  @Patch('vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  updateVehicle(@CurrentRoleContext() ctx: RoleContext, @Param('vehicleId', ParseIntPipe) vehicleId: number, @Body() dto: UpdateVehicleDto) {
    return this.runs.updateVehicle(ctx.userId, vehicleId, dto);
  }

  @Patch('vehicles/:vehicleId/deactivate')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  deactivateVehicle(@CurrentRoleContext() ctx: RoleContext, @Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.runs.deactivateVehicle(ctx.userId, vehicleId);
  }

  @Post('runs/:runId/vehicle')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
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
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  createAssignment(@CurrentRoleContext() ctx: RoleContext, @Body() dto: CreateParcelRunAssignmentDto) {
    return this.assignments.createAssignment(ctx.userId, dto);
  }

  @Patch('assignments/:assignmentId/loaded')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  markLoaded(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.markLoaded(ctx, assignmentId);
  }

  @Patch('assignments/:assignmentId/unloaded')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  markUnloaded(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.markUnloaded(ctx, assignmentId);
  }

  @Patch('assignments/:assignmentId/cancel')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER)
  cancelAssignment(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.cancelAssignment(ctx.userId, assignmentId);
  }

  // ── SUPER AGENT: explicit carrier release / movement tender ──────────────
  @Post('movement-tenders')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  tenderParcelToProvider(
    @CurrentRoleContext() ctx: RoleContext,
    @Body() dto: { parcelId: number; transportProviderId: number; runId: number; loadRunStopId: number; idempotencyKey: string; expiresAt?: string | null },
  ) {
    return this.assignments.tenderFromSuperAgent(ctx, dto);
  }

  // ── SUPER AGENT: receiving desk ──────────────────────────────────────────
  @Patch('assignments/:assignmentId/confirm-receipt')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  confirmReceipt(@CurrentRoleContext() ctx: RoleContext, @Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.assignments.confirmReceipt(ctx, assignmentId);
  }

  // ── SUPER AGENT: desk queues ────────────────────────────────────────────
  @Get('desk/blocked-receipts')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  listMyDeskBlockedReceipts(@CurrentRoleContext() ctx: RoleContext) {
    return this.journey.listHubBlockedAwaitingReceipt(ctx.profileId);
  }

  @Get('desk/awaiting-completion')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT)
  listMyDeskAwaitingCompletion(@CurrentRoleContext() ctx: RoleContext) {
    return this.journey.listHubAwaitingCompletion(ctx.profileId);
  }

  // ── Shared: parcel journey context / eligible Runs ──────────────────────
  // Any operational actor may look up where a parcel is and what Runs it
  // could join -- read-only, never a write; ownership for the actual write
  // (createAssignment etc.) is still enforced inside those services.
  @Get('parcels/:parcelId/journey')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT, AccountRoleType.AGENT, AccountRoleType.ADMIN)
  async getParcelJourney(@CurrentRoleContext() ctx: RoleContext, @Param('parcelId', ParseIntPipe) parcelId: number) {
    await this.journey.assertParcelOperationalVisibility(ctx.userId, ctx.roleType, ctx.profileId ?? null, parcelId);
    return this.journey.resolveJourneyContext(parcelId);
  }

  @Get('parcels/:parcelId/eligible-runs')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN)
  async getEligibleRuns(@CurrentRoleContext() ctx: RoleContext, @Param('parcelId', ParseIntPipe) parcelId: number) {
    await this.journey.assertParcelOperationalVisibility(ctx.userId, ctx.roleType, ctx.profileId ?? null, parcelId);
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
