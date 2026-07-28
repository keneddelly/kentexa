import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AgentsService } from '../agents/agents.service';
import { SuperAgentsService } from './super-agents.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ParcelStatus } from './entities/parcel.entity';

@Controller('super-agents')
export class SuperAgentsController {
  constructor(
    private service: SuperAgentsService,
    private agentsService: AgentsService,
  ) {}

  // ── Public ────────────────────────────────────────────────────────────────

  // Public parcel tracking — KTX-XXX-XXX format (Super Agent parcels)
  @Get('track/:trackingNumber')
  trackParcel(@Param('trackingNumber') trackingNumber: string) {
    return this.service.trackParcel(trackingNumber);
  }

  // Track by Order ID — for boda/personal/direct delivery orders
  @Get('track-order/:orderId')
  trackByOrderId(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.service.trackByOrderId(orderId);
  }

  // Get all Tanzania cities
  @Get('cities')
  getCities() {
    return this.service.getCities();
  }

  // Estimate shipping fee at product-posting time (seller doesn't know buyer's city yet)
  @Get('estimate-shipping')
  estimateShipping(
    @Query('originCity') originCity: string,
    @Query('weightKg') weightKg: string,
  ) {
    return this.service.estimateShippingFromOrigin(
      originCity,
      Number(weightKg) || 1,
    );
  }

  // Calculate shipping cost
  @Get('calculate-shipping')
  calculateShipping(
    @Query('origin') origin: string,
    @Query('destination') destination: string,
    @Query('weight') weight: string,
  ) {
    return this.service.calculateShipping(
      origin,
      destination,
      Number(weight) || 1,
    );
  }

  // Get shipping rates for a city
  @Get('rates/:city')
  getShippingRates(@Param('city') city: string) {
    return this.service.getShippingRates(city);
  }

  // ── Authenticated ─────────────────────────────────────────────────────────

  // Apply to become super agent
  @UseGuards(JwtAuthGuard)
  @Post('apply')
  apply(@Request() req, @Body() dto: any) {
    return this.service.apply(req.user, dto);
  }

  // Get my super agent profile
  @UseGuards(JwtAuthGuard)
  @Get('my-profile')
  getMyProfile(@Request() req) {
    return this.service.getMyProfile(req.user);
  }

  // ── Public: hub info for viewing any super agent's profile ───────────────
  @Get('public/:userId')
  getPublicProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findPublicByUserId(userId);
  }

  // Super agent dashboard
  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  getDashboard(@Request() req) {
    return this.service.getDashboard(req.user);
  }

  // Set shipping rates
  @UseGuards(JwtAuthGuard)
  @Post('rates')
  setRates(@Request() req, @Body() body: { rates: any[] }) {
    return this.service.setShippingRates(req.user, body.rates);
  }

  // ── Parcel operations ─────────────────────────────────────────────────────

  // Seller creates parcel (handover request)
  @UseGuards(JwtAuthGuard)
  @Post('parcels')
  createParcel(@Request() req, @Body() dto: any) {
    return this.service.createParcel(req.user, dto);
  }

  // ── Seller: Offline intercity order — customer paid outside KenteXa ──────
  @UseGuards(JwtAuthGuard)
  @Post('offline-intercity')
  createOfflineIntercity(@Request() req, @Body() dto: any) {
    return this.service.createOfflineIntercityOrder(req.user, dto);
  }

  // Super agent receives parcel from seller
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:trackingNumber/receive')
  receiveParcel(
    @Request() req,
    @Param('trackingNumber') tn: string,
    @Body() dto: any,
  ) {
    return this.service.receiveParcel(req.user, tn, dto);
  }

  // Super agent dispatches parcel
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:trackingNumber/dispatch')
  dispatchParcel(
    @Request() req,
    @Param('trackingNumber') tn: string,
    @Body() dto: any,
  ) {
    return this.service.dispatchParcel(req.user, tn, dto);
  }

  // Update parcel status (any agent)
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:trackingNumber/status')
  updateStatus(
    @Request() req,
    @Param('trackingNumber') tn: string,
    @Body() dto: { status: ParcelStatus; city: string; note?: string },
  ) {
    return this.service.updateParcelStatus(req.user, tn, dto);
  }

  // ── Local agent — last-mile delivery ────────────────────────────────────────

  // Parcels that arrived at hub in this city, not yet claimed
  @UseGuards(JwtAuthGuard)
  @Get('incoming-parcels')
  getIncomingParcels(@Query('city') city: string) {
    return this.service.getIncomingParcels(city);
  }

  // My claimed deliveries (out for delivery)
  @UseGuards(JwtAuthGuard)
  @Get('my-deliveries')
  getMyDeliveries(@Request() req) {
    return this.service.getMyDeliveries(req.user.id);
  }

  // Claim a parcel for last-mile delivery
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:trackingNumber/claim')
  claimParcel(@Request() req, @Param('trackingNumber') tn: string) {
    return this.service.claimParcel(req.user, tn);
  }

  // Mark out-for-delivery / delivered (only my claimed parcels)
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:trackingNumber/delivery-status')
  updateMyDeliveryStatus(
    @Request() req,
    @Param('trackingNumber') tn: string,
    @Body() dto: { status: ParcelStatus; note?: string },
  ) {
    return this.service.updateMyDeliveryStatus(
      req.user,
      tn,
      dto.status,
      dto.note,
    );
  }

  // ── Bulk shipments ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('bulk-shipments')
  createBulkShipment(@Request() req, @Body() dto: any) {
    return this.service.createBulkShipment(req.user, dto);
  }

  // Dispatch a sealed bulk shipment with courier cost + receipt
  @UseGuards(JwtAuthGuard)
  @Patch('bulk-shipments/:id/dispatch')
  dispatchBulkShipment(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.dispatchBulkShipment(req.user, Number(id), dto);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.service.approve(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @Body('reason') reason: string) {
    return this.service.suspend(Number(id), reason);
  }

  // ── Admin: courier cost reimbursement ledger ────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/courier-cost-ledger')
  getCourierCostLedger() {
    return this.service.getCourierCostLedger();
  }

  // Mark a parcel's or bulk shipment's courier cost as settled with the agent
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/courier-cost/:type/:idOrTrackingNumber/settle')
  markCostSettled(
    @Param('type') type: 'parcel' | 'bulk',
    @Param('idOrTrackingNumber') id: string,
  ) {
    return this.service.markCostSettled(type, id);
  }
  // ══ Intercity route table (admin) ══════════════════════════════════════

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post('admin/seed-routes')
  seedRoutes() {
    return this.service.seedRoutes();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/routes')
  getAllRoutes() {
    return this.service.getAllRoutes();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post('admin/routes')
  upsertRoute(@Body() dto: any) {
    return this.service.upsertRoute(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Delete('admin/routes/:id')
  deleteRoute(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteRoute(id);
  }

  // ══ Agent performance (admin) ═══════════════════════════════════════════

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/performance')
  getAllAgentsPerformance() {
    return this.service.getAllAgentsPerformance();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/performance/:id')
  getAgentPerformance(@Param('id', ParseIntPipe) id: number) {
    return this.service.getAgentPerformance(id);
  }

  // ══ Route lookup (public — used by checkout for ETA) ════════════════════

  @Get('route/:origin/:destination')
  getRoute(
    @Param('origin') origin: string,
    @Param('destination') destination: string,
  ) {
    return this.service.getRoute(
      decodeURIComponent(origin),
      decodeURIComponent(destination),
    );
  }

  // ══ Collection fee config ═══════════════════════════════════════════════

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/collection-fees')
  getCollectionFees() {
    return this.service.getCollectionFees();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post('admin/collection-fees')
  setCollectionFee(
    @Body() body: { city: string; urbanFee: number; ruralFee: number },
  ) {
    return this.service.setCollectionFee(
      body.city,
      body.urbanFee,
      body.ruralFee,
    );
  }

  // ══ Seller shipments ════════════════════════════════════════════════════

  @UseGuards(JwtAuthGuard)
  @Post('shipments')
  createSellerShipment(@Request() req, @Body() body: any) {
    return this.service.createSellerShipment(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('shipments/:trackingNumber/transport')
  updateShipmentTransport(
    @Param('trackingNumber') tn: string,
    @Request() req,
    @Body() body: any,
  ) {
    return this.service.updateShipmentTransport(req.user, tn, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('shipments/:trackingNumber/arrived')
  confirmArrived(
    @Param('trackingNumber') tn: string,
    @Request() req,
    @Body() body: { city: string; note?: string },
  ) {
    return this.service.confirmShipmentArrived(req.user, tn, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shipments/:trackingNumber/request-delivery')
  requestDelivery(
    @Param('trackingNumber') tn: string,
    @Request() req,
    @Body() body: { agentId: number; agreedFee: number; address?: string },
  ) {
    return this.service.buyerRequestDelivery(req.user, tn, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shipments/:trackingNumber/self-pickup')
  selfPickup(@Param('trackingNumber') tn: string, @Request() req) {
    return this.service.buyerSelfPickup(req.user, tn);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shipments/my')
  getMyShipments(@Request() req) {
    return this.service.getMyShipments(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shipments/buyer')
  getBuyerParcels(@Query('phone') phone: string) {
    return this.service.getBuyerParcels(phone);
  }

  // ── Available agents for last-mile at destination city ───────────────────
  @Get('shipments/agents/:city')
  getAgentsForDelivery(@Param('city') city: string) {
    return this.agentsService.findByCity(decodeURIComponent(city));
  }

  @Post('parcels/:trackingNumber/transfer-hub')
  @UseGuards(JwtAuthGuard)
  transferToHub(
    @Request() req,
    @Param('trackingNumber') trackingNumber: string,
    @Body()
    dto: {
      destinationHub: string;
      destinationCity: string;
      transportMode?: string;
      note?: string;
    },
  ) {
    return this.service.transferToHub(req.user.id, trackingNumber, dto);
  }

  // ── Admin: Hub Management ─────────────────────────────────────────────────
  @Get('admin/super-agents')
  @UseGuards(JwtAuthGuard)
  adminGetAll(@Query('status') status?: string) {
    return this.service.adminGetAllSuperAgents(status);
  }

  @Patch('admin/super-agents/:id/assign-hub')
  @UseGuards(JwtAuthGuard)
  adminAssignHub(
    @Param('id') id: string,
    @Body()
    dto: {
      hubCity: string;
      hubName: string;
      hubAddress?: string;
      coverageZones?: string[];
    },
  ) {
    return this.service.adminAssignHub(Number(id), dto);
  }

  @Get('admin/hub-summary')
  @UseGuards(JwtAuthGuard)
  adminHubSummary() {
    return this.service.adminGetHubSummary();
  }
}
