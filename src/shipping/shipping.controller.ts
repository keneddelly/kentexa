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
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SellerScopeService } from '../business/seller-scope.service';

@Controller('shipping')
export class ShippingController {
  constructor(
    private shippingService: ShippingService,
    private sellerScope: SellerScopeService,
  ) {}

  // Seller: Mark preparing
  @UseGuards(JwtAuthGuard)
  @Patch('orders/:id/preparing')
  async markPreparing(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canCreateOrders',
    );
    return this.shippingService.markPreparing(id, sellerId);
  }

  // Seller: Upload direct shipping info
  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/ship')
  async uploadShipmentInfo(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      trackingNumber: string;
      courierName: string;
      shipmentProofUrl?: string;
    },
    @Request() req,
  ) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canCreateOrders',
    );
    return this.shippingService.uploadShipmentInfo(id, sellerId, body);
  }

  // Agent: Mark delivered
  @UseGuards(JwtAuthGuard)
  @Patch('orders/:id/delivered')
  markDelivered(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.shippingService.markDelivered(id, req.user.id);
  }

  // Buyer: Confirm receipt
  @UseGuards(JwtAuthGuard)
  @Patch('orders/:id/confirm')
  confirmDelivery(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.shippingService.buyerConfirmDelivery(id, req.user.id);
  }

  // Buyer: Open dispute
  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/dispute')
  openDispute(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Request() req,
  ) {
    return this.shippingService.openDispute(id, req.user, reason);
  }

  // Buyer/seller on the order, or admin — not any logged-in user.
  @UseGuards(JwtAuthGuard)
  @Get('orders/:id/tracking')
  getTracking(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.shippingService.getOrderTracking(id, req.user);
  }

  // Seller: Get my orders
  @UseGuards(JwtAuthGuard)
  @Get('seller/orders')
  async getSellerOrders(@Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canViewOrders',
    );
    return this.shippingService.getSellerOrders(sellerId);
  }

  // Admin: Resolve dispute
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('orders/:id/resolve-dispute')
  resolveDispute(
    @Param('id', ParseIntPipe) id: number,
    @Body('resolution') resolution: 'release_to_seller' | 'refund_buyer',
    @Request() req,
  ) {
    return this.shippingService.resolveDispute(id, req.user, resolution);
  }
}
