import {
  Controller, Get, Post, Patch,
  Body, Param, UseGuards, Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('shipping')
export class ShippingController {
  constructor(private shippingService: ShippingService) {}

  // Seller: Mark preparing
  @UseGuards(JwtAuthGuard)
  @Patch('orders/:id/preparing')
  markPreparing(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    return this.shippingService.markPreparing(id, req.user.id);
  }

  // Seller: Upload direct shipping info
  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/ship')
  uploadShipmentInfo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      trackingNumber: string;
      courierName: string;
      shipmentProofUrl?: string;
    },
    @Request() req,
  ) {
    return this.shippingService.uploadShipmentInfo(id, req.user.id, body);
  }

  // Agent: Mark delivered
  @UseGuards(JwtAuthGuard)
  @Patch('orders/:id/delivered')
  markDelivered(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    return this.shippingService.markDelivered(id, req.user.id);
  }

  // Buyer: Confirm receipt
  @UseGuards(JwtAuthGuard)
  @Patch('orders/:id/confirm')
  confirmDelivery(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
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
    return this.shippingService.openDispute(id, req.user.id, reason);
  }

  // Public: Track order
  @UseGuards(JwtAuthGuard)
  @Get('orders/:id/tracking')
  getTracking(@Param('id', ParseIntPipe) id: number) {
    return this.shippingService.getOrderTracking(id);
  }

  // Seller: Get my orders
  @UseGuards(JwtAuthGuard)
  @Get('seller/orders')
  getSellerOrders(@Request() req) {
    return this.shippingService.getSellerOrders(req.user.id);
  }

  // Admin: Resolve dispute
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('orders/:id/resolve-dispute')
  resolveDispute(
    @Param('id', ParseIntPipe) id: number,
    @Body('resolution') resolution: 'release_to_seller' | 'refund_buyer',
  ) {
    return this.shippingService.resolveDispute(id, resolution);
  }
}