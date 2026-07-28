import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { DailyBatchesService } from './daily-batches.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('daily-batches')
export class DailyBatchesController {
  constructor(private service: DailyBatchesService) {}

  // ── Seller/Super Agent: create an offline (walk-in/cash) order ───────────
  @UseGuards(JwtAuthGuard)
  @Post('offline-order')
  createOfflineOrder(
    @Body()
    body: {
      productName: string;
      amount: number;
      buyerName: string;
      buyerPhone: string;
      deliveryAddress: string;
      quantity?: number;
      notes?: string;
    },
    @Request() req,
  ) {
    return this.service.createOfflineOrderAndAssign(req.user, body);
  }

  // ── Seller: assign order to today's/tomorrow's batch ─────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('assign/:orderId')
  assignOrder(@Param('orderId', ParseIntPipe) orderId: number, @Request() req) {
    return this.service.assignOrderToBatch(orderId, req.user);
  }

  // ── Hub staff: mark parcel received at Kariakoo hub ───────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:parcelId/received')
  markReceived(@Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.service.markReceivedAtHub(parcelId);
  }

  // ── Dispatcher: today's manifest, grouped by zone ─────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('manifest/today')
  getTodaysManifest() {
    return this.service.getTodaysManifest();
  }

  // ── Dispatcher: mark van departed ─────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':batchId/depart')
  departVan(
    @Param('batchId', ParseIntPipe) batchId: number,
    @Body()
    body: { driverName?: string; driverPhone?: string; vehicleInfo?: string },
  ) {
    return this.service.departVan(batchId, body);
  }

  // ── Zone agent: mark their zone as arrived ────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':batchId/zones/:zoneId/arrived')
  markZoneArrival(
    @Param('batchId', ParseIntPipe) batchId: number,
    @Param('zoneId', ParseIntPipe) zoneId: number,
  ) {
    return this.service.markZoneArrival(batchId, zoneId);
  }

  // ── Zone agent: mark individual parcel delivered ──────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch('parcels/:parcelId/delivered')
  markDelivered(@Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.service.markParcelDelivered(parcelId);
  }

  // ── Buyer: track their parcel's batch status ──────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('order/:orderId/status')
  getStatusForOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.service.getParcelStatusForOrder(orderId);
  }

  // ── Public: list active zones ────────────────────────────────────────────
  @Get('zones')
  getZones() {
    return this.service.getZones();
  }

  // ── Public: boda fee suggestions for seller listing ────────────────────
  @Get('boda-fee-suggestions')
  getBodaFeeSuggestions(@Query('sellerAddress') sellerAddress?: string) {
    return this.service.getBodaFeeSuggestions(sellerAddress);
  }

  // ── Public: get delivery methods for a buyer address — reads from DB zones
  @Get('delivery-methods')
  getDeliveryMethods(
    @Query('address') address: string,
    @Query('productId') productId: string,
  ) {
    return this.service.getDeliveryMethods(address, Number(productId));
  }

  // ── Admin: create a new delivery zone ─────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('zones')
  createZone(
    @Body()
    body: {
      name: string;
      city: string;
      routeOrder: number;
      etaMinutesFromDeparture: number;
      zoneAgentId?: number;
      addressKeywords?: string[];
    },
  ) {
    return this.service.createZone(body);
  }

  // ── Admin: update a zone ───────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('zones/:id')
  updateZone(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.updateZone(id, body);
  }
}
