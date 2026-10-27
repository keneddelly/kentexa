import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { FoodOrdersService } from './food-orders.service';

// Hotel food ordering (owner 2026-10-27). See FoodOrdersService for the rules.
@Controller('food')
export class FoodOrdersController {
  constructor(private readonly service: FoodOrdersService) {}

  // ── Public: a hotel's menu (no account needed to look) ──────────────────
  @Get('menu/:businessId')
  @Header('Cache-Control', 'no-store')
  menu(@Param('businessId', ParseIntPipe) businessId: number) {
    return this.service.publicMenu(businessId);
  }

  @Get('profile/:commerceProfileId')
  @Header('Cache-Control', 'public, max-age=60')
  forProfile(@Param('commerceProfileId', ParseIntPipe) id: number) {
    return this.service.menuForProfile(id);
  }

  // ── The customer ─────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('orders')
  place(@Request() req, @Body() body: Record<string, any>) {
    return this.service.placeOrder(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/mine')
  @Header('Cache-Control', 'no-store')
  mine(@Request() req) {
    return this.service.myOrders(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:id')
  @Header('Cache-Control', 'no-store')
  one(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getOrder(req.user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/lipa-proof')
  proof(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, any>) {
    return this.service.attachProof(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/cancel')
  cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(req.user, id);
  }

  // ── The hotel: settings, menu, kitchen ───────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('hotel/:businessId/settings')
  @Header('Cache-Control', 'no-store')
  settings(@Request() req, @Param('businessId', ParseIntPipe) businessId: number) {
    return this.service.hotelSettings(businessId, req.user);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Patch('hotel/:businessId/settings')
  updateSettings(@Request() req, @Param('businessId', ParseIntPipe) businessId: number, @Body() body: Record<string, any>) {
    return this.service.updateSettings(businessId, req.user, body, req.roleContext);
  }

  @UseGuards(JwtAuthGuard)
  @Get('hotel/:businessId/items')
  @Header('Cache-Control', 'no-store')
  items(@Request() req, @Param('businessId', ParseIntPipe) businessId: number) {
    return this.service.hotelItems(businessId, req.user);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Post('hotel/:businessId/items')
  createItem(@Request() req, @Param('businessId', ParseIntPipe) businessId: number, @Body() body: Record<string, any>) {
    return this.service.createItem(businessId, req.user, body, req.roleContext);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Patch('hotel/:businessId/items/:itemId')
  updateItem(@Request() req, @Param('businessId', ParseIntPipe) businessId: number,
    @Param('itemId', ParseIntPipe) itemId: number, @Body() body: Record<string, any>) {
    return this.service.updateItem(businessId, itemId, req.user, body, req.roleContext);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Delete('hotel/:businessId/items/:itemId')
  removeItem(@Request() req, @Param('businessId', ParseIntPipe) businessId: number, @Param('itemId', ParseIntPipe) itemId: number) {
    return this.service.removeItem(businessId, itemId, req.user, req.roleContext);
  }

  @UseGuards(JwtAuthGuard)
  @Get('hotel/:businessId/kitchen')
  @Header('Cache-Control', 'no-store')
  kitchen(@Request() req, @Param('businessId', ParseIntPipe) businessId: number) {
    return this.service.kitchen(businessId, req.user);
  }

  // action: accept {minutes} | reject {reason} | ready | done | confirm-payment | reject-payment {reason}
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Post('hotel/:businessId/orders/:orderId/:action')
  step(@Request() req, @Param('businessId', ParseIntPipe) businessId: number, @Param('orderId', ParseIntPipe) orderId: number,
    @Param('action') action: string, @Body() body: Record<string, any>) {
    return this.service.step(businessId, orderId, req.user, action, body, req.roleContext);
  }
}
