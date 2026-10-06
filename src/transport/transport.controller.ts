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
import { TransportService, DiscoverySortBy, DISCOVERY_SORT_VALUES } from './transport.service';
import { TransportQuoteService } from './transport-quote.service';
import type { CreateQuoteDto } from './transport-quote.service';
import { JourneySelectionService, assertClientAuthoredJourney } from './journey-selection.service';
import type { SelectJourneyDto } from './journey-selection.service';
import { JourneyComposerService } from './journey-composer.service';
import type { ComposeJourneyDto, SelectComposedJourneyDto } from './journey-composer.service';
import { AssignmentStatus } from './entities/transport-assignment.entity';
import { AvailabilityStatus } from './entities/provider-availability.entity';
import { VerificationService } from '../identity/verification.service';
import { Feature } from '../identity/verification.constants';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';
import { LogisticsServiceOfferService } from './logistics-service-offer.service';
import type { DiscoverServiceOffersDto, CommitServiceOfferDto } from './logistics-service-offer.service';

@Controller('transport')
export class TransportController {
  constructor(
    private readonly svc: TransportService,
    private readonly verification: VerificationService,
    private readonly quotes: TransportQuoteService,
    private readonly journeys: JourneySelectionService,
    private readonly journeyComposer: JourneyComposerService,
    private readonly serviceOffers: LogisticsServiceOfferService,
  ) {}

  // ── CUSTOMER SERVICE OFFERS (Issue #95) ───────────────────────────────────
  // Customer asks for an outcome. Kentexa resolves eligible actors and only
  // advertises services it can actually start fulfilling.
  @UseGuards(JwtAuthGuard)
  @Post('service-offers/discover')
  discoverServiceOffers(@Body() dto: DiscoverServiceOffersDto) {
    return this.serviceOffers.discover(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('service-offers/commit')
  commitServiceOffer(@Request() req, @Body() dto: CommitServiceOfferDto) {
    return this.serviceOffers.commit(req.user.id, dto);
  }

  // ── JOURNEY COMPOSITION (L1) ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('journeys/compose')
  composeJourney(@Body() dto: ComposeJourneyDto) {
    return this.journeyComposer.compose(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('journeys/select-composed')
  selectComposedJourney(@Request() req, @Body() dto: SelectComposedJourneyDto) {
    return this.journeyComposer.selectComposed(req.user.id, dto);
  }

  // Gate 3: a Journey with no transport leg (sender -> Agent -> recipient).
  // The server writes every leg; the request names the two places and the cargo.
  @UseGuards(JwtAuthGuard)
  @Post('journeys/select-direct')
  selectDirectJourney(@Request() req, @Body() dto: ComposeJourneyDto) {
    return this.journeyComposer.selectDirectDelivery(req.user.id, dto);
  }

  // ── JOURNEY SELECTION (L1) ───────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('journeys')
  selectJourney(@Request() req, @Body() dto: SelectJourneyDto) {
    assertClientAuthoredJourney(dto);
    return this.journeys.select(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('journeys/:id')
  getJourney(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.journeys.getOwned(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('journeys/:id/replan')
  replanJourney(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: SelectJourneyDto) {
    assertClientAuthoredJourney(dto);
    return this.journeys.replan(req.user.id, id, dto);
  }

  // ── QUOTES (Stage 3S-B3) ────────────────────────────────────────────────
  // Any authenticated user — same "ordinary sender or seller/business acting
  // user, no marketplace Order required" convention Shipment itself already
  // uses. Creation/acceptance never reserves capacity or writes a Parcel;
  // see TransportQuoteService's own doc comment.
  @UseGuards(JwtAuthGuard)
  @Post('quotes')
  createQuote(@Request() req, @Body() dto: CreateQuoteDto) {
    return this.quotes.createQuote(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('quotes/:id')
  getQuote(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.quotes.getQuote(req.user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('quotes/:id/accept')
  acceptQuote(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.quotes.acceptQuote(req.user, id);
  }

  // ── PROVIDER REGISTRATION ─────────────────────────────────────────────────
  // 2026-08-28 identity-verification architecture audit: registering as an
  // operational transporter used to require nothing beyond being logged
  // in, creating a real (PENDING) TransportProvider row with zero identity
  // check — the same gap already closed for seller/super-agent
  // applications and classified posting. Same table, same pattern.
  @Post('register')
  @UseGuards(JwtAuthGuard)
  async register(@Request() req, @Body() dto: any) {
    await this.verification.requireFeature(req.user.id, Feature.BECOME_TRANSPORTER);
    return this.svc.register(req.user, dto);
  }

  // Self-status-check, same precedent as SellerController.getMyProfile: a
  // pending applicant is active as buyer (their transport_provider
  // AccountRole isn't ACTIVE yet) and must still see their own application
  // status, so this is deliberately not gated by active role.
  @Get('my-profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return this.svc.getMyProfile(req.user.id);
  }

  @Patch('my-profile')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  updateProfile(@Request() req, @Body() dto: any) {
    return this.svc.updateProfile(req.user.id, dto);
  }

  // ── ROUTES ────────────────────────────────────────────────────────────────
  @Post('routes')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  addRoute(@Request() req, @Body() dto: any) {
    return this.svc.addRoute(req.user.id, dto);
  }

  @Get('routes')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  getRoutes(@Request() req) {
    return this.svc.getMyRoutes(req.user.id);
  }

  // ── Public: provider info + routes for viewing any provider's profile ────
  @Get('public/:userId')
  getPublicProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.findPublicByUserId(userId);
  }

  @Patch('routes/:id')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  updateRoute(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.svc.updateRoute(req.user.id, id, dto);
  }

  // ── AVAILABILITY ─────────────────────────────────────────────────────────
  @Post('availability')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  publishAvailability(@Request() req, @Body() dto: any) {
    return this.svc.publishAvailability(req.user.id, dto);
  }

  @Get('availability')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  getMyAvailability(@Request() req, @Query('days') days?: string) {
    return this.svc.getMyAvailability(req.user.id, days ? Number(days) : 7);
  }

  @Patch('availability/:id/status')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  updateAvailStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: AvailabilityStatus,
  ) {
    return this.svc.updateAvailabilityStatus(req.user.id, id, status);
  }

  // ── SUPER AGENT: FIND TRANSPORT ───────────────────────────────────────────
  // Public — RouteCoverageMap.js genuinely calls this pre-login. Used to
  // return the raw internal dispatch shape (full TransportProvider entity,
  // including apiKey/contract fields, embedded in every result) to anyone.
  // Same underlying query now goes through a safe, credential-free
  // projection instead.
  //
  // Stage 3S-B2: `sortBy`/`weightKg` are additive query params. Neither is
  // required — a caller supplying neither (every existing caller today) sees
  // byte-for-byte the same trips in the same order as before this stage.
  @Get('available')
  findAvailable(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('sortBy') sortBy?: string,
    @Query('weightKg') weightKgRaw?: string,
  ) {
    const parsedSort = DISCOVERY_SORT_VALUES.includes(sortBy as DiscoverySortBy)
      ? (sortBy as DiscoverySortBy)
      : undefined; // unrecognised/absent -> findAvailableForRoute's own default ('earliest')
    const weightKg = Number(weightKgRaw);
    return this.svc.findPublicAvailabilityForRoute(
      from, to, Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0, parsedSort,
    );
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
  // A transport assignment is created by whoever is dispatching a parcel —
  // normally a Super Agent (or an admin acting on their behalf). Previously
  // any authenticated user could hit this with no role check at all and
  // create assignments against any verified provider using unvalidated
  // ids; the role guard here plus the ownership/legitimacy checks inside
  // createAssignment() (parcel must belong to the caller's own hub,
  // availability must belong to the selected provider) close that.
  //
  // 3S-B1: gated on the CURRENT active role (RoleContextGuard/ActiveRoleGuard),
  // matching every other hub-authority route in this file, instead of the
  // legacy account-wide `UserRole` field — createAssignment() itself now
  // validates the specific acting hub profile from roleContext, not merely
  // "this user owns a SuperAgent row somewhere."
  @Post('assignments')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN, AccountRoleType.MANAGER)
  createAssignment(@Request() req, @Body() dto: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.svc.createAssignment(req.user, dto, roleContext);
  }

  @Get('assignments')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
  getAssignments(@Request() req, @Query('status') status?: string) {
    return this.svc.getMyAssignments(req.user.id, status);
  }

  @Patch('assignments/:id/respond')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.ADMIN)
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

  // svc.updateAssignmentStatus() legitimately authorizes three different
  // active parties for the SAME assignment: the owning transport provider,
  // the Super Agent who created it, or an admin/manager -- all three active
  // roles must stay allowed here, the service's own ownership check (not
  // this gate) is what ties the caller to the specific assignment.
  @Patch('assignments/:id/status')
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(
    AccountRoleType.TRANSPORT_PROVIDER,
    AccountRoleType.SUPER_AGENT,
    AccountRoleType.ADMIN,
    AccountRoleType.MANAGER,
  )
  updateAssignmentStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: { status: AssignmentStatus; proofUrl?: string; notes?: string },
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    return this.svc.updateAssignmentStatus(req.user, id, dto, roleContext);
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
