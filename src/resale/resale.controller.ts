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

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req) {
    return this.svc.myOffers(req.user.id);
  }

  @Get('products')
  @UseGuards(JwtAuthGuard)
  openProducts(@Request() req, @Query('page') page?: string) {
    return this.svc.openProducts(req.user.id, Number(page) || 1);
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

  @Delete('offers/:id')
  @UseGuards(JwtAuthGuard)
  close(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.closeOffer(req.user.id, id);
  }
}
