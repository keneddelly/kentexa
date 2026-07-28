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
} from '@nestjs/common';
import { AgentOrdersService } from './agent-orders.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('agent-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AGENT, UserRole.MANAGER, UserRole.ADMIN)
export class AgentOrdersController {
  constructor(private service: AgentOrdersService) {}

  // Get all available orders for pickup
  @Get('available')
  getAvailable(@Request() req) {
    return this.service.getAvailableOrders(req.user);
  }

  // Get my assigned orders
  @Get('my-orders')
  getMyOrders(@Request() req) {
    return this.service.getMyOrders(req.user);
  }

  // Get agent pickup stats
  @Get('stats')
  getStats(@Request() req) {
    return this.service.getAgentPickupStats(req.user);
  }

  // Get single order details
  @Get(':orderId')
  getDetails(@Param('orderId', ParseIntPipe) orderId: number, @Request() req) {
    return this.service.getOrderDetails(orderId, req.user);
  }

  // Claim an order for pickup
  @Post(':orderId/claim')
  claim(@Param('orderId', ParseIntPipe) orderId: number, @Request() req) {
    return this.service.claimOrder(orderId, req.user);
  }

  // Confirm pickup from seller
  @Patch(':orderId/pickup')
  confirmPickup(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Request() req,
    @Body() body: { note?: string },
  ) {
    return this.service.confirmPickup(orderId, req.user, body.note);
  }

  // Confirm delivery to customer
  @Patch(':orderId/deliver')
  confirmDelivery(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Request() req,
    @Body() body: { note?: string },
  ) {
    return this.service.confirmDelivery(orderId, req.user, body.note);
  }
}
