import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ResaleService } from './resale.service';

/** "Uza tena" (resell), owner approved 2026-11-09. See resale.service.ts. */
@Controller('resale')
export class ResaleController {
  constructor(private readonly svc: ResaleService) {}

  /** A shared offer, public: the reseller and the selling price. */
  @Get('offers/:id')
  publicOffer(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publicOffer(id);
  }

  // ── Members (owner 2026-11-10) ──
  @Get('membership')
  @UseGuards(JwtAuthGuard)
  membership(@Request() req) {
    return this.svc.membership(req.user.id);
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  join(@Request() req, @Body() body: any) {
    return this.svc.join(req.user, body || {});
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req) {
    return this.svc.myOffers(req.user.id);
  }

  @Get('products')
  @UseGuards(JwtAuthGuard)
  openProducts(@Request() req, @Query('page') page?: string, @Query('q') q?: string, @Query('category') category?: string,
    @Query('supplierId') supplierId?: string, @Query('sort') sort?: string) {
    return this.svc.openProducts(req.user.id, { page: Number(page) || 1, q, category, supplierId: Number(supplierId) || undefined, sort });
  }

  /** Public: counts for the Uza tena page (no prices). */
  @Get('stats')
  stats() {
    return this.svc.publicStats();
  }

  @Get('supplier/summary')
  @UseGuards(JwtAuthGuard)
  supplierSummary(@Request() req) {
    return this.svc.supplierSummary(req.user.id);
  }

  @Post('supplier/bulk')
  @UseGuards(JwtAuthGuard)
  supplierBulk(@Request() req, @Body() body: any) {
    return this.svc.supplierBulk(req.user.id, body || {});
  }

  /** Public: a reseller's shelf on their profile (their prices only). */
  @Get('sellers/:id/offers')
  shelf(@Param('id', ParseIntPipe) id: number) {
    return this.svc.resellerShelf(id);
  }

  /** Public: how many of a shop's products are open for reselling (shop page door). */
  @Get('suppliers/:id/count')
  supplierCount(@Param('id', ParseIntPipe) id: number) {
    return this.svc.supplierOpenCount(id);
  }

  @Get('products/:id')
  @UseGuards(JwtAuthGuard)
  terms(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.terms(id, req.user.id);
  }

  @Post('offers')
  @UseGuards(JwtAuthGuard)
  save(@Request() req, @Body() body: any) {
    return this.svc.saveOffer(req.user, body || {});
  }

  // ── R3: the profit record ──
  @Get('profits')
  @UseGuards(JwtAuthGuard)
  profits(@Request() req) {
    return this.svc.myProfits(req.user.id);
  }

  @Get('supplier-orders')
  @UseGuards(JwtAuthGuard)
  supplierOrders(@Request() req) {
    return this.svc.supplierOrders(req.user.id);
  }

  @Post('orders/:id/paid')
  @UseGuards(JwtAuthGuard)
  paid(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('ref') ref: string) {
    return this.svc.markPaid(req.user.id, id, ref);
  }

  @Post('orders/:id/confirm')
  @UseGuards(JwtAuthGuard)
  confirm(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.confirm(req.user.id, id);
  }

  @Post('orders/:id/dispute')
  @UseGuards(JwtAuthGuard)
  dispute(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('note') note: string) {
    return this.svc.dispute(req.user.id, id, note);
  }

  @Delete('offers/:id')
  @UseGuards(JwtAuthGuard)
  close(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.closeOffer(req.user.id, id);
  }
}
