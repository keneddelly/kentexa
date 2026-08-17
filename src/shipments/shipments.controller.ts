/**
 * ShipmentsController
 * Place at: src/shipments/shipments.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ShipmentsService } from './shipments.service';
import type { CreateShipmentDto } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly svc: ShipmentsService) {}

  // Public — any user browsing "send something" needs this before logging
  // in to see what's even possible on their route. weightKg (optional)
  // hard-filters to providers who can actually carry that much.
  @Get('routes')
  findRoutes(
    @Query('origin') origin: string,
    @Query('destination') destination: string,
    @Query('weightKg') weightKg?: string,
  ) {
    if (!origin?.trim() || !destination?.trim()) {
      throw new BadRequestException('origin and destination are required');
    }
    return this.svc.findAvailableRoutes(origin, destination, weightKg ? Number(weightKg) : 0);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req, @Body() dto: CreateShipmentDto) {
    return this.svc.createShipment(req.user.id, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req) {
    return this.svc.getMyShipments(req.user.id);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard)
  confirm(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { providerId?: number; availabilityId?: number; routeId?: number },
  ) {
    return this.svc.confirmShipment(req.user.id, id, dto);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.cancelShipment(req.user.id, id);
  }

  // Public — tracking must work for the receiver too, who may not have an
  // account at all.
  @Get('track/:trackingNumber')
  track(@Param('trackingNumber') trackingNumber: string) {
    return this.svc.trackShipment(trackingNumber);
  }
}
