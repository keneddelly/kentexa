import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  CreateOrderForBuyerDto,
} from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  // ── Customer ──────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req) {
    return this.ordersService.create(dto, req.user);
  }

  // ── Seller: create a real online order for a registered buyer from chat ──
  @UseGuards(JwtAuthGuard)
  @Post('create-for-buyer')
  createForBuyer(@Body() dto: CreateOrderForBuyerDto, @Request() req) {
    return this.ordersService.createForBuyer(req.user, dto.buyerId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/rate-seller')
  rateSeller(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { rating: number; comment?: string },
  ) {
    return this.ordersService.rateSellerForOrder(
      id,
      req.user,
      body.rating,
      body.comment,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-orders')
  getMyOrders(@Request() req) {
    return this.ordersService.findMyOrders(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/detail')
  getOrderDetail(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.getOrderDetail(id, req.user);
  }

  // Find order by tracking number — public, for boda/personal tracking fallback
  @Get('by-tracking/:trackingNumber')
  findByTrackingNumber(@Param('trackingNumber') trackingNumber: string) {
    return this.ordersService.findByTrackingNumber(trackingNumber);
  }

  // Seller creates order on behalf of customer (offline payment)
  @UseGuards(JwtAuthGuard)
  @Post('on-behalf')
  createOnBehalf(@Request() req, @Body() dto: any) {
    return this.ordersService.createOnBehalf(req.user, dto);
  }

  // Admin: force change order status
  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-status')
  adminChangeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string },
    @Request() req,
  ) {
    return this.ordersService.adminChangeStatus(id, body.status, req.user);
  }

  // Get available delivery methods for a buyer address + product
  // Called by Checkout when buyer fills in their address
  @Get('delivery-methods')
  getDeliveryMethods(
    @Query('address') address: string,
    @Query('productId') productId: string,
  ) {
    return this.ordersService.getDeliveryMethods(address, Number(productId));
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.cancel(id, req.user);
  }

  // ── Buyer: Confirm receipt ────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':id/confirm')
  buyerConfirm(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.buyerConfirm(id, req.user);
  }

  // ── Buyer: Raise dispute ──────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':id/dispute')
  raiseDispute(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { reason: string; image?: string },
  ) {
    return this.ordersService.raiseDispute(id, req.user, body);
  }

  // ── Seller: Upload shipping proof (direct shipping) ───────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':id/shipping-proof')
  uploadShippingProof(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body()
    body: {
      trackingNumber: string;
      shippingReceiptImage: string;
      shippingProductImage: string;
      shippingNote?: string;
      shippingMethod?: string;
    },
  ) {
    return this.ordersService.uploadShippingProof(id, req.user, body);
  }

  // ── Seller: Mark as shipped ───────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':id/ship')
  markShipped(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.markShipped(id, req.user);
  }

  // ── Seller: Hand parcel to Super Agent ────────────────────────────────────
  // Called when seller physically hands parcel to super agent
  // System records handover — super agent will scan and generate tracking
  @UseGuards(JwtAuthGuard)
  @Patch(':id/hand-to-agent')
  sellerHandToSuperAgent(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { superAgentCity: string; notes?: string },
  ) {
    return this.ordersService.sellerHandToSuperAgent(id, req.user, body);
  }

  // ── Super Agent: Look up order before receiving ───────────────────────────
  // Auto-fills destination city, recipient name & phone in the agent's UI
  @UseGuards(JwtAuthGuard)
  @Get(':id/agent-lookup')
  lookupForAgent(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.lookupForAgent(id);
  }

  // ── Super Agent: Scan & receive order ─────────────────────────────────────
  // Super agent enters order ID → system generates tracking number
  // and auto-updates order to IN_TRANSIT
  @UseGuards(JwtAuthGuard)
  @Patch(':id/super-agent-receive')
  superAgentReceiveOrder(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body()
    body: {
      originCity: string;
      destinationCity: string;
      weightKg?: number;
      parcelPhoto?: string;
      notes?: string;
      actualShippingFee?: number;
    },
  ) {
    return this.ordersService.superAgentReceiveOrder(id, req.user, body);
  }

  // ── Agent: Mark received ──────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @Patch(':id/agent-received')
  agentMarkReceived(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { note?: string },
  ) {
    return this.ordersService.agentMarkReceived(id, req.user, body.note);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/financial-summary')
  getFinancialSummary() {
    return this.ordersService.getFinancialSummary();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.ordersService.updateStatus(id, status as any);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/resolve-dispute')
  resolveDispute(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { resolution: string; favour: 'buyer' | 'seller' },
  ) {
    return this.ordersService.resolveDispute(id, req.user, body);
  }

  // ── Seller: Generate confirmation link & send to buyer ───────────────────
  @UseGuards(JwtAuthGuard)
  @Post(':id/send-confirmation')
  generateConfirmationLink(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    return this.ordersService.generateConfirmationLink(id, req.user);
  }

  // ── Public: Get order info by confirmation token (no auth) ────────────────
  @Get('confirm/lookup')
  getByConfirmationToken(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Token inahitajika');
    return this.ordersService.getOrderByConfirmationToken(token);
  }

  // ── Public: Confirm or dispute via token (no auth) ────────────────────────
  @Post('confirm/submit')
  confirmViaToken(
    @Body()
    body: {
      token: string;
      confirmed: boolean;
      rating?: number;
      review?: string;
      reportNote?: string;
    },
  ) {
    if (!body.token) throw new BadRequestException('Token inahitajika');
    return this.ordersService.confirmViaToken(body.token, body);
  }
}
