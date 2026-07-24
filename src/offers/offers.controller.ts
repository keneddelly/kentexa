/**
 * OffersController
 * Place at: src/offers/offers.controller.ts
 */
import {
  Controller, Get, Post, Patch, Param,
  Body, Request, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OffersService } from './offers.service';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @Post()
  makeOffer(@Request() req, @Body() dto: {
    classifiedId: number; offerAmount: number; buyerNote?: string;
  }) {
    return this.svc.makeOffer(req.user.id, dto);
  }

  @Patch(':id/respond')
  respond(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { action: 'accept'|'decline'|'counter'; counterAmount?: number; sellerNote?: string },
  ) {
    return this.svc.respondToOffer(req.user.id, id, dto);
  }

  @Get('sent')
  getSent(@Request() req) {
    return this.svc.getMyOffersSent(req.user.id);
  }

  @Get('received')
  getReceived(@Request() req) {
    return this.svc.getMyOffersReceived(req.user.id);
  }

  @Get('classified/:id')
  getForClassified(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getOffersForClassified(id, req.user.id);
  }
}