/**
 * ShipmentsController
 * Place at: src/shipments/shipments.controller.ts
 */
import { parseTravelDate } from '../transport/run-supply';
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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ShipmentsService } from './shipments.service';
import type { ConfirmShipmentDto, CreateShipmentDto, DiscoverySideInput } from './shipments.service';
import { readPlaceRefQuery } from './logistics-location-context';
import { ShipmentActivationService } from './shipment-activation.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly svc: ShipmentsService, private readonly activation: ShipmentActivationService) {}

  // Public — any user browsing "send something" needs this before logging
  // in to see what's even possible on their route. weightKg (optional)
  // hard-filters to providers who can actually carry that much.
  @Get('routes')
  findRoutes(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('originPlace') originPlace?: unknown,
    @Query('destinationPlace') destinationPlace?: unknown,
    @Query('weightKg') weightKg?: string,
    @Query('providerId') providerId?: string,
    @Query() query?: Record<string, unknown>,
  ) {
    // Per side: a selected place reference (`<providerKey>:<providerPlaceId>`,
    // split only at the FIRST ':') wins over legacy text; either may be used
    // on either side; neither is a 400. A malformed reference is a 400 -- it
    // is never reinterpreted as text or matched by name.
    // Gate 1: the place reference is read in every shape a client can send
    // it (see readPlaceRefQuery) -- the canonical string, or the object the
    // place search itself returns.
    const side = (name: string, placeParam: unknown, text?: string): DiscoverySideInput => {
      const place = readPlaceRefQuery(
        placeParam !== undefined ? { ...(query ?? {}), [`${name}Place`]: placeParam } : query,
        `${name}Place`,
      );
      if (place.present) {
        if (!place.ref) throw new BadRequestException(`${name}Place must be <providerKey>:<providerPlaceId>`);
        return { place: place.ref };
      }
      if (typeof text !== 'string' || !text.trim()) {
        throw new BadRequestException(`${name} (or ${name}Place) is required`);
      }
      return { text };
    };
    const weight = weightKg === undefined || weightKg === '' ? 0 : Number(weightKg);
    if (!Number.isFinite(weight) || weight < 0) {
      throw new BadRequestException('weightKg must be a non-negative number');
    }
    const provider = providerId === undefined || providerId === '' ? undefined : Number(providerId);
    if (provider !== undefined && (!Number.isInteger(provider) || provider <= 0)) {
      throw new BadRequestException('providerId must be a positive integer');
    }
    // Gate 2: an optional travel day (Tanzania calendar, YYYY-MM-DD). Read
    // from the query object so the positional signature stays as it was.
    const rawDate = query?.date;
    const onDate = rawDate === undefined || rawDate === '' ? undefined : parseTravelDate(rawDate);
    const sides: [DiscoverySideInput, DiscoverySideInput] = [
      side('origin', originPlace, origin),
      side('destination', destinationPlace, destination),
    ];
    return onDate
      ? this.svc.findAvailableRoutesForSides(sides[0], sides[1], weight, provider, onDate)
      : this.svc.findAvailableRoutesForSides(sides[0], sides[1], weight, provider);
  }

  // Stage 2F hub discovery -- authenticated, READ-ONLY: lists eligible hubs,
  // never selects or writes. Sender-safe fields only (hubId, name, city,
  // address). Declared before the ':id' routes so 'hubs' is never an id.
  // Place preview: an exact <providerKey>:<providerPlaceId> reference; a
  // malformed one is a 400, never reinterpreted as text.
  @Get('hubs')
  @UseGuards(JwtAuthGuard)
  hubsForPlace(
    @Query('place') placeParam?: unknown,
    @Query('side') side?: string,
    @Query() query?: Record<string, unknown>,
  ) {
    const place = readPlaceRefQuery(
      placeParam !== undefined ? { ...(query ?? {}), place: placeParam } : query,
      'place',
    );
    if (!place.present || !place.ref) {
      throw new BadRequestException('place must be <providerKey>:<providerPlaceId>');
    }
    return this.svc.discoverHubsForPlace(place.ref, side);
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

  // Authenticated customer only. Possessing a tracking number is never
  // sufficient: the claim finalizer also requires the desk receipt secret
  // and an unexpired OTP delivered to the recorded sender phone.
  @Post(':id/claim/start')
  @UseGuards(JwtAuthGuard)
  startWalkInClaim(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { receiptSecret?: string },
  ) {
    if (typeof body?.receiptSecret !== 'string') {
      throw new BadRequestException('Invalid claim credentials');
    }
    return this.svc.startWalkInShipmentClaim(req.user.id, id, body.receiptSecret);
  }

  @Post(':id/claim')
  @UseGuards(JwtAuthGuard)
  claimWalkIn(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { receiptSecret?: string; otp?: string },
  ) {
    if (typeof body?.receiptSecret !== 'string' || typeof body?.otp !== 'string') {
      throw new BadRequestException('Invalid claim credentials');
    }
    return this.svc.claimWalkInShipment(req.user.id, id, body.receiptSecret, body.otp);
  }

  // Admin operations ledger — all shipment requests regardless of intake
  // channel. This is deliberately separate from /mine (ownership) and public
  // tracking. Admin authority comes from the CURRENT active role.
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER_CARE)
  adminList(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getAdminShipments({ status, q, limit: limit ? Number(limit) : undefined });
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard)
  confirm(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmShipmentDto,
  ) {
    return this.svc.confirmShipment(req.user.id, id, dto);
  }

  @Patch(':id/confirm-and-activate')
  @UseGuards(JwtAuthGuard)
  confirmAndActivate(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmShipmentDto,
  ) {
    return this.activation.confirmAndActivate(req.user.id, id, dto);
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

  // Shipment-bound hub discovery: owner-only, from the stored server-derived
  // snapshot (the same keys the confirm-time decision uses).
  @Get(':id/hubs')
  @UseGuards(JwtAuthGuard)
  hubsForShipment(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('side') side?: string,
  ) {
    return this.svc.discoverHubsForShipment(req.user.id, id, side);
  }
}
