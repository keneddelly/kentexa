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
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

// "Hub staff" / "Dispatcher" / "Zone agent" (the roles these comments name)
// have no dedicated AccountRoleType of their own -- this is Dar es Salaam
// hub-based last-mile logistics, operationally closest to Agent/Super
// Agent. None of markReceivedAtHub/getTodaysManifest/departVan/
// markZoneArrival/markParcelDelivered take a user param at all, so there is
// no per-zone/per-batch entitlement to check yet (a real gap -- see the
// closure report); this gate closes the "any authenticated buyer can mark
// any parcel delivered" hole at the role level without inventing a
// per-resource ownership model that isn't wired into the service.
const HUB_OPERATIONAL_ROLES = [
  AccountRoleType.AGENT,
  AccountRoleType.SUPER_AGENT,
  AccountRoleType.ADMIN,
  AccountRoleType.MANAGER,
];

@Controller('daily-batches')
export class DailyBatchesController {
  constructor(private service: DailyBatchesService) {}

  // ── Seller/Super Agent: create an offline (walk-in/cash) order ───────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SELLER, AccountRoleType.SUPER_AGENT, AccountRoleType.ADMIN)
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
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SELLER, AccountRoleType.ADMIN)
  @Post('assign/:orderId')
  assignOrder(@Param('orderId', ParseIntPipe) orderId: number, @Request() req) {
    return this.service.assignOrderToBatch(orderId, req.user);
  }

  // ── Hub staff: mark parcel received at Kariakoo hub ───────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...HUB_OPERATIONAL_ROLES)
  @Patch('parcels/:parcelId/received')
  markReceived(@Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.service.markReceivedAtHub(parcelId);
  }

  // ── Dispatcher: today's manifest, grouped by zone ─────────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...HUB_OPERATIONAL_ROLES)
  @Get('manifest/today')
  getTodaysManifest() {
    return this.service.getTodaysManifest();
  }

  // ── Dispatcher: mark van departed ─────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...HUB_OPERATIONAL_ROLES)
  @Patch(':batchId/depart')
  departVan(
    @Param('batchId', ParseIntPipe) batchId: number,
    @Body()
    body: { driverName?: string; driverPhone?: string; vehicleInfo?: string },
  ) {
    return this.service.departVan(batchId, body);
  }

  // ── Zone agent: mark their zone as arrived ────────────────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...HUB_OPERATIONAL_ROLES)
  @Patch(':batchId/zones/:zoneId/arrived')
  markZoneArrival(
    @Param('batchId', ParseIntPipe) batchId: number,
    @Param('zoneId', ParseIntPipe) zoneId: number,
  ) {
    return this.service.markZoneArrival(batchId, zoneId);
  }

  // ── Zone agent: mark individual parcel delivered ──────────────────────────
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(...HUB_OPERATIONAL_ROLES)
  @Patch('parcels/:parcelId/delivered')
  markDelivered(@Param('parcelId', ParseIntPipe) parcelId: number) {
    return this.service.markParcelDelivered(parcelId);
  }

  // ── Buyer: track their parcel's batch status ──────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('order/:orderId/status')
  getStatusForOrder(@Param('orderId', ParseIntPipe) orderId: number, @Request() req) {
    return this.service.getParcelStatusForOrder(orderId, req.user);
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
